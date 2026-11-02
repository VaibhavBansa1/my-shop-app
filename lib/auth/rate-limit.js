// Attempt counting for rate limits. With Redis: sliding windows in sorted sets (fast, shared by all app
// processes). Without Redis: the login_attempts table (also shared, a bit slower).
import { randomUUID } from 'node:crypto';
import { getPool } from '../db.js';
import { withRedis } from '../redis.js';
import { tooMany } from '../errors.js';

const keyAll = (k) => `rl:all:${k}`;
const keyFail = (k) => `rl:fail:${k}`;

/** Throw 429 if `key` has >= max attempts (optionally only failures) in the window. */
export async function assertUnderLimit(key, { max, windowSeconds, failuresOnly = true }) {
  const now = Date.now();
  const viaRedis = await withRedis(async (r) => {
    const k = failuresOnly ? keyFail(key) : keyAll(key);
    await r.zremrangebyscore(k, 0, now - windowSeconds * 1000);
    return r.zcard(k);
  });
  const n = viaRedis !== undefined ? viaRedis : (await getPool().query(
    `select count(*)::int as n from login_attempts
      where key = $1 and at > now() - make_interval(secs => $2) and ($3 = false or success = false)`,
    [key, windowSeconds, failuresOnly])).rows[0].n;
  if (n >= max) throw tooMany();
}

export async function recordAttempt(key, success) {
  const now = Date.now();
  const ok = await withRedis(async (r) => {
    const m = r.multi().zadd(keyAll(key), now, `${now}:${randomUUID()}`).pexpire(keyAll(key), 2 * 86400_000);
    if (!success) m.zadd(keyFail(key), now, `${now}:${randomUUID()}`).pexpire(keyFail(key), 2 * 86400_000);
    await m.exec();
    return true;
  });
  if (!ok) await getPool().query('insert into login_attempts (key, success) values ($1, $2)', [key, success]);
}

/**
 * Reserve-then-check for password guesses. The attempt is recorded as a failure BEFORE the password is
 * verified, then counted, so N parallel requests cannot all see "9 so far" and slip through together
 * (check-then-record would allow ~200 guesses in one burst). Call `succeeded()` when the password was right.
 */
export async function reserveFailure(key, { max, windowSeconds }) {
  const now = Date.now();
  const member = `${now}:${randomUUID()}`;
  const viaRedis = await withRedis(async (r) => {
    const res = await r.multi()
      .zremrangebyscore(keyFail(key), 0, now - windowSeconds * 1000)
      .zadd(keyFail(key), now, member).pexpire(keyFail(key), 2 * 86400_000)
      .zadd(keyAll(key), now, member).pexpire(keyAll(key), 2 * 86400_000)
      .zcard(keyFail(key)).exec();
    return res[5][1];
  });
  let id = null; let n = viaRedis;
  if (viaRedis === undefined) {
    id = (await getPool().query('insert into login_attempts (key, success) values ($1, false) returning id', [key])).rows[0].id;
    n = (await getPool().query(
      `select count(*)::int as n from login_attempts where key = $1 and success = false and at > now() - make_interval(secs => $2)`,
      [key, windowSeconds])).rows[0].n;
  }
  if (n > max) throw tooMany();
  return {
    async succeeded() {
      if (id !== null) await getPool().query('update login_attempts set success = true where id = $1', [id]);
      else await withRedis((r) => r.zrem(keyFail(key), member));
    },
  };
}

// ---- Overall per-user request limit (protects the server from one account flooding it) ----
// Fixed one-minute window. With Redis it is shared by all app processes; without it, each process counts
// on its own (so the effective limit is per process). API_RATE_PER_MIN (default 600 = 10 per second).
const local = new Map();
export async function apiRequestAllowed(userId, now = Date.now()) {
  const max = Number(process.env.API_RATE_PER_MIN || 600);
  if (!(max > 0)) return true;
  const win = Math.floor(now / 60000);
  const viaRedis = await withRedis(async (r) => {
    const k = `rl:api:${userId}:${win}`;
    const [[, n]] = await r.multi().incr(k).expire(k, 120).exec();
    return n;
  });
  let n = viaRedis;
  if (n === undefined) {
    const k = `${userId}:${win}`;
    n = (local.get(k) ?? 0) + 1; local.set(k, n);
    if (local.size > 50_000) for (const key of local.keys()) if (!key.endsWith(`:${win}`)) local.delete(key);
  }
  return n <= max;
}

/**
 * Count-and-reserve for limits on actions (not password guesses): records the attempt first, then counts, so
 * parallel requests cannot all pass the check. Over the limit the reservation is removed again and 429 is thrown.
 * Returns release(): call it if the action then fails, so a failed attempt does not use up the allowance.
 */
export async function reserveAttempt(key, { max, windowSeconds }) {
  const now = Date.now();
  const member = `${now}:${randomUUID()}`;
  const viaRedis = await withRedis(async (r) => {
    const res = await r.multi().zremrangebyscore(keyAll(key), 0, now - windowSeconds * 1000)
      .zadd(keyAll(key), now, member).pexpire(keyAll(key), 2 * 86400_000).zcard(keyAll(key)).exec();
    return res[3][1];
  });
  let id = null; let n = viaRedis;
  if (viaRedis === undefined) {
    id = (await getPool().query('insert into login_attempts (key, success) values ($1, true) returning id', [key])).rows[0].id;
    n = (await getPool().query('select count(*)::int as n from login_attempts where key = $1 and at > now() - make_interval(secs => $2)',
      [key, windowSeconds])).rows[0].n;
  }
  const release = async () => {
    if (id !== null) await getPool().query('delete from login_attempts where id = $1', [id]);
    else await withRedis((r) => r.zrem(keyAll(key), member));
  };
  if (n > max) { await release(); throw tooMany(); }
  return release;
}
