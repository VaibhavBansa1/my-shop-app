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
