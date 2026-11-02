// Feature flags, security log, report cache, job queue (Postgres and Redis/BullMQ) and Redis rate limits.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, OWNER_URL } from './helpers.js';
import pg from 'pg';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
const REDIS = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15';
let redisUp = false;
before(async () => {
  await setupDb();
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
    await r.connect(); await r.flushdb(); redisUp = (await r.ping()) === 'PONG'; await r.quit();
  } catch { redisUp = false; }
});
after(async () => {
  const { closeRedis } = await import('../lib/redis.js');
  const { closeQueue } = await import('../lib/queue.js');
  await closeQueue(); await closeRedis(); await closePool();
});
const owner = async (sql, p) => { const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); try { return await c.query(sql, p); } finally { await c.end(); } };

test('feature flags: off switch, deterministic rollout, allow/deny lists, env override', async () => {
  const { flagEnabled, clearFlagCache, flagsFor } = await import('../lib/flags.js');
  const a = await makeUserOrg(); const b = await makeUserOrg();
  assert.equal(await flagEnabled('ocr', a.org.id), true);
  assert.equal(await flagEnabled('unknown_flag', a.org.id), true, 'unknown flags never hide features');
  await owner("update feature_flags set enabled = false where key = 'ocr'"); await clearFlagCache();
  assert.equal(await flagEnabled('ocr', a.org.id), false);
  await owner("update feature_flags set enabled = true, rollout_percent = 0, allow_orgs = array[$1::uuid] where key = 'ai'", [a.org.id]); await clearFlagCache();
  assert.equal(await flagEnabled('ai', a.org.id), true, 'allow list wins over 0% rollout');
  assert.equal(await flagEnabled('ai', b.org.id), false);
  await owner("update feature_flags set rollout_percent = 50, allow_orgs = '{}', deny_orgs = array[$1::uuid] where key = 'ai'", [a.org.id]); await clearFlagCache();
  assert.equal(await flagEnabled('ai', a.org.id), false, 'deny list wins');
  const results = await Promise.all(Array.from({ length: 200 }, (_, i) => flagEnabled('ai', `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)));
  const on = results.filter(Boolean).length;
  assert.ok(on > 70 && on < 130, `~50% rollout, got ${on}/200`);
  assert.equal(await flagEnabled('ai', b.org.id), await flagEnabled('ai', b.org.id), 'stable per business');
  process.env.FLAG_IMPORT = 'off';
  assert.equal((await flagsFor(a.org.id)).import, false);
  delete process.env.FLAG_IMPORT;
  await owner("update feature_flags set enabled = true, rollout_percent = 100, allow_orgs = '{}', deny_orgs = '{}'"); await clearFlagCache();
});

test('flagged API returns 404 when a feature is off', async () => {
  const { clearFlagCache } = await import('../lib/flags.js');
  const A = await import('../lib/services/accounts.js');
  const { db, user } = await makeUserOrg();
  const token = (await A.login({ email: user.email, password: 'correct horse battery' }, { ip: 'f1' })).session.token;
  const mod = await import('../app/api/v1/orgs/[orgId]/ocr/parse/route.js');
  const call = () => mod.POST(new Request(`http://x/api/v1/orgs/${db.orgId}/ocr/parse`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Total 10' }) }), { params: Promise.resolve({ orgId: db.orgId }) });
  assert.equal((await call()).status, 200);
  process.env.FLAG_OCR = 'off';
  const r = await call();
  assert.equal(r.status, 404);
  assert.ok(r.headers.get('x-request-id'), 'every response carries a request id');
  delete process.env.FLAG_OCR; await clearFlagCache();
});

test('security log: events recorded; each user reads only their own; sessions list and revoke', async () => {
  const { securityEvent, myEvents } = await import('../lib/services/securityLog.js');
  const { listSessions, revokeSession } = await import('../lib/services/sessionsList.js');
  const A = await import('../lib/services/accounts.js');
  const S = await import('../lib/auth/session.js');
  const a = await makeUserOrg(); const b = await makeUserOrg();
  await securityEvent('login.failure', { userId: a.user.id, ip: '1.2.3.4', detail: 'email=x' });
  await securityEvent('password.changed', { userId: b.user.id });
  const mine = await myEvents(a.user.id);
  assert.ok(mine.some((e) => e.event === 'login.failure' && e.ip === '1.2.3.4'));
  assert.ok(!mine.some((e) => e.event === 'password.changed'), "cannot see another user's events");
  const { withOrg } = await import('../lib/db.js');
  const peek = await withOrg({ userId: a.user.id }, (c) => c.query('select count(*)::int n from security_events where user_id = $1', [b.user.id]));
  assert.equal(peek.rows[0].n, 0, 'RLS hides other users even with raw SQL');
  const s2 = await A.login({ email: a.user.email, password: 'correct horse battery' }, { ip: 'phone', userAgent: 'MyShop Android' });
  const current = S.hashToken(s2.session.token);
  const list = await listSessions(a.user.id, current);
  assert.ok(list.length >= 2 && list.filter((x) => x.current).length === 1);
  const other = list.find((x) => !x.current);
  await revokeSession(a.user.id, other.id);
  assert.equal((await listSessions(a.user.id, current)).length, list.length - 1);
  await assert.rejects(revokeSession(b.user.id, list.find((x) => x.current).id), /not found/, "cannot revoke someone else's session");
});

test('report cache: hit on repeat, invalidated by any new voucher', async () => {
  const { cachedReport, clearLocalCache } = await import('../lib/cache.js');
  const { metrics } = await import('../lib/metrics.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const m = await import('../lib/services/masters.js');
  const R = await import('../lib/services/reports.js');
  clearLocalCache();
  const { db } = await makeUserOrg();
  const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(db, { name: 'Pen', unitId: pcs, salePrice: 10, openingQty: 50, openingRate: 5 });
  let computed = 0;
  const get = () => cachedReport(db, 'dashboard', {}, async () => { computed++; return R.dashboard(db); });
  const hitsBefore = (await metrics.cache.get()).values.find((v) => v.labels.result === 'hit')?.value ?? 0;
  const d1 = await get(); const d2 = await get();
  assert.equal(computed, 1); assert.deepEqual(d1, d2);
  assert.ok(((await metrics.cache.get()).values.find((v) => v.labels.result === 'hit')?.value ?? 0) > hitsBefore);
  await createVoucher(db, { type: 'sales', date: new Date().toISOString().slice(0, 10), reference: '', narration: '', items: [{ stockItemId: item.id, qty: 2, rate: 10 }], entries: [] });
  const d3 = await get();
  assert.equal(computed, 2, 'new voucher -> fresh report');
  assert.equal(d3.today.sales, d1.today.sales + 20);
});

test('Postgres job queue: encrypted payload, retries with backoff, wiped after success, schedules once a day', async () => {
  const { enqueue, runPgJobsOnce } = await import('../lib/queue.js');
  const { enqueueDueSchedules } = await import('../lib/jobs.js');
  delete process.env.REDIS_URL;
  await owner('delete from jobs'); await owner('delete from scheduled_runs');
  await enqueue('email.send', { to: 'a@b.co', subject: 'Reset', text: 'https://shop/reset#SECRET-TOKEN' });
  const stored = (await owner('select payload from jobs')).rows[0].payload;
  assert.ok(stored.startsWith('enc:v1:') && !stored.includes('SECRET-TOKEN'), 'payload encrypted at rest');
  let calls = 0; let fail = true;
  const handlers = { 'email.send': async (p) => { calls++; assert.equal(p.to, 'a@b.co'); if (fail) throw new Error('smtp down'); } };
  assert.equal(await runPgJobsOnce(handlers), 1);
  let row = (await owner('select attempts, done_at, last_error, run_at > now() as later from jobs')).rows[0];
  assert.equal(row.attempts, 1); assert.equal(row.done_at, null); assert.match(row.last_error, /smtp down/); assert.equal(row.later, true);
  await owner('update jobs set run_at = now()');
  fail = false;
  assert.equal(await runPgJobsOnce(handlers), 1);
  row = (await owner('select done_at, payload from jobs')).rows[0];
  assert.ok(row.done_at); assert.equal(row.payload, '', 'payload wiped after success');
  assert.equal(calls, 2);
  assert.equal(await enqueueDueSchedules(enqueue, { date: '2026-11-02', hour: 9, minute: 0 }), 2);
  assert.equal(await enqueueDueSchedules(enqueue, { date: '2026-11-02', hour: 23, minute: 0 }), 0, 'once per day');
  assert.equal(await enqueueDueSchedules(enqueue, { date: '2026-11-03', hour: 2, minute: 0 }), 0, 'not before its time');
});

test('Redis: rate limits and BullMQ queue (skipped when Redis is not running)', { skip: false }, async (t) => {
  if (!redisUp) { t.skip('Redis not available'); return; }
  process.env.REDIS_URL = REDIS;
  const { redis } = await import('../lib/redis.js');
  const r = redis(); if (r.status !== 'ready') await new Promise((res) => r.once('ready', res));
  const { assertUnderLimit, recordAttempt } = await import('../lib/auth/rate-limit.js');
  const key = `test:${Date.now()}`;
  for (let i = 0; i < 3; i++) { await assertUnderLimit(key, { max: 3, windowSeconds: 60 }); await recordAttempt(key, false); }
  await assert.rejects(assertUnderLimit(key, { max: 3, windowSeconds: 60 }), /Too many/);
  await assertUnderLimit(`${key}:other`, { max: 3, windowSeconds: 60 });
  const before = (await owner('select count(*)::int n from login_attempts')).rows[0].n;
  await recordAttempt(`${key}:x`, true);
  assert.equal((await owner('select count(*)::int n from login_attempts')).rows[0].n, before, 'Redis mode does not touch the table');
  const { enqueue } = await import('../lib/queue.js');
  const { Worker } = await import('bullmq');
  const got = [];
  const { bullConnection } = await import('../lib/redis.js');
  const conn = bullConnection();
  const w = new Worker('myshop', async (job) => { got.push([job.name, job.data]); }, { connection: conn });
  await enqueue('email.send', { to: 'x@y.z' });
  for (let i = 0; i < 50 && !got.length; i++) await new Promise((res) => setTimeout(res, 100));
  await w.close(); await conn.quit();
  assert.deepEqual(got, [['email.send', { to: 'x@y.z' }]]);
  delete process.env.REDIS_URL;
});

test('metrics: request histogram has route patterns, not ids', async () => {
  const { metrics, routePattern } = await import('../lib/metrics.js');
  assert.equal(routePattern('/api/v1/orgs/3f2b7c1e-1111-4222-8333-444455556666/vouchers/9f2b7c1e-1111-4222-8333-444455556666'), '/api/v1/orgs/:id/vouchers/:id');
  const text = await metrics.registry.metrics();
  assert.match(text, /myshop_http_request_duration_seconds_bucket\{[^}]*route="\/api\/v1\/orgs\/:id\/ocr\/parse"/);
  assert.ok(!/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}/.test(text), 'no ids in labels');
});

test('cleanup job runs as the app role; security log keeps at least 30 days and cannot be deleted directly', async () => {
  const { handlers } = await import('../lib/jobs.js');
  const { getPool } = await import('../lib/db.js');
  await owner("insert into security_events (event, at) values ('login.failure', now() - interval '400 days'), ('login.failure', now() - interval '10 days')");
  await handlers['cleanup.run']();
  const left = (await owner("select count(*)::int n from security_events where at < now() - interval '5 days'")).rows[0].n;
  assert.equal(left, 1, 'old event purged, recent kept');
  await assert.rejects(getPool().query('delete from security_events'), /permission denied/);
  await getPool().query('select purge_old_security_events(1)');
  assert.equal((await owner("select count(*)::int n from security_events where at < now() - interval '5 days'")).rows[0].n, 1, 'minimum retention 30 days');
});
