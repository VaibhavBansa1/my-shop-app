// Database-backed attempt counting (works across multiple app instances).
import { getPool } from '../db.js';
import { tooMany } from '../errors.js';

/** Throw 429 if `key` has >= max attempts (optionally only failures) in the window. */
export async function assertUnderLimit(key, { max, windowSeconds, failuresOnly = true }) {
  const { rows } = await getPool().query(
    `select count(*)::int as n from login_attempts
      where key = $1 and at > now() - make_interval(secs => $2) and ($3 = false or success = false)`,
    [key, windowSeconds, failuresOnly],
  );
  if (rows[0].n >= max) throw tooMany();
}

export async function recordAttempt(key, success) {
  await getPool().query('insert into login_attempts (key, success) values ($1, $2)', [key, success]);
}
