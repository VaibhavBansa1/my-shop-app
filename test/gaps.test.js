// Overall per-user request limit, safe error logging, and event payload privacy.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupDb, makeUserOrg, closePool, ownerQuery } from './helpers.js';

before(setupDb);
after(closePool);

test('per-user request limit: over API_RATE_PER_MIN in one minute is refused, next minute is fine', async () => {
  const { apiRequestAllowed } = await import('../lib/auth/rate-limit.js');
  const prev = process.env.API_RATE_PER_MIN;
  process.env.API_RATE_PER_MIN = '3';
  try {
    const u = randomUUID(); const t = Date.UTC(2026, 10, 2, 10, 0, 5);
    assert.deepEqual(await Promise.all([1, 2, 3, 4].map(() => apiRequestAllowed(u, t))), [true, true, true, false]);
    assert.equal(await apiRequestAllowed(randomUUID(), t), true, 'other users are not affected');
    assert.equal(await apiRequestAllowed(u, t + 60_000), true, 'a new minute starts fresh');
  } finally { if (prev === undefined) delete process.env.API_RATE_PER_MIN; else process.env.API_RATE_PER_MIN = prev; }
});

test('database errors are logged without the values they quote', async () => {
  const { errText, errStack } = await import('../lib/log.js');
  const { getPool } = await import('../lib/db.js');
  await getPool().query('create temp table t (name text unique)');
  await getPool().query("insert into t values ('Ramesh Traders')").catch(() => {});
  const e = await getPool().query("insert into t values ('Ramesh Traders')").catch((x) => x);
  assert.match(e.detail ?? e.message, /Ramesh/);           // Postgres itself quotes the value...
  assert.doesNotMatch(errText(e), /Ramesh/);               // ...our log line does not
  assert.match(errText(e), /postgres 23505/);
  assert.equal(errStack(e), undefined);
  assert.equal(errText(new Error('plain')), 'plain');
});

test('events leaving for Kafka carry no names or free text', async () => {
  process.env.EVENTS_ENABLED = '1';
  try {
    const m = await import('../lib/services/masters.js');
    const { createVoucher, cancelVoucher } = await import('../lib/services/vouchers.js');
    const { db } = await makeUserOrg();
    const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
    const it = await m.createItem(db, { name: 'Secret Recipe Masala', sku: 'SRM', unitId: pcs, hsnCode: '0910', gstRate: 5, salePrice: 10,
      purchasePrice: 5, reorderLevel: 0, openingQty: 5, openingRate: 5, isActive: true });
    const v = await createVoucher(db, { type: 'sales', date: '2026-05-10', reference: '', narration: 'private note', roundOff: true, entries: [],
      items: [{ stockItemId: it.id, qty: 1, rate: '10' }] });
    await cancelVoucher(db, v.id, 'customer Sharma complained');
    const { rows } = await ownerQuery('select payload from outbox where org_id = $1', [db.orgId]);
    const all = JSON.stringify(rows);
    assert.ok(rows.length >= 3);
    for (const secret of ['Secret Recipe', 'SRM', 'private note', 'Sharma']) assert.ok(!all.includes(secret), secret);
  } finally { delete process.env.EVENTS_ENABLED; }
});

test('O-05: parallel reminder clicks never pass the per-customer daily limit; failed sends do not use it up', async () => {
  const { reserveAttempt } = await import('../lib/auth/rate-limit.js');
  const key = `reminder-test:${randomUUID()}`;
  const rs = await Promise.allSettled(Array.from({ length: 10 }, () => reserveAttempt(key, { max: 3, windowSeconds: 86400 })));
  // Never more than 3. (Under an exact-same-moment burst it may refuse a few extra; that is the safe direction.)
  assert.ok(rs.filter((r) => r.status === 'fulfilled').length <= 3);
  assert.ok(rs.filter((r) => r.status === 'rejected').every((r) => /Too many/.test(r.reason.message)));
  const key2 = `reminder-test:${randomUUID()}`;
  const release = await reserveAttempt(key2, { max: 1, windowSeconds: 86400 });
  await release();                                            // e.g. the email could not be sent
  await reserveAttempt(key2, { max: 1, windowSeconds: 86400 }); // so the allowance is still there
});

test('O-06: production uses the __Host- cookie prefix (HTTPS only, this host only)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', ['-e', "import('./lib/http.js').then((h) => console.log(h.sessionCookie('t'.repeat(40), 60)))"],
    { env: { ...process.env, NODE_ENV: 'production', APP_ORIGIN: 'https://shop.example.in' } }).toString();
  assert.match(out, /^__Host-sid=t{40}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=60; Secure/);
  assert.doesNotMatch(out, /Domain=/i);
});
