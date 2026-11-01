// Server-side sessions. Client holds a random token; DB stores only sha256(token).
import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../db.js';

export const SESSION_COOKIE = 'sid';
const IDLE_MS = 30 * 24 * 3600 * 1000;      // sliding expiry
const ABSOLUTE_MS = 90 * 24 * 3600 * 1000;  // hard cap since creation

export const hashToken = (token) => createHash('sha256').update(token).digest();

export async function createSession(client, userId, { ip, userAgent } = {}) {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    `insert into sessions (token_hash, user_id, expires_at, ip, user_agent)
     values ($1, $2, now() + make_interval(secs => $3), $4, $5)`,
    [hashToken(token), userId, IDLE_MS / 1000, ip ?? null, (userAgent ?? '').slice(0, 512)],
  );
  return { token, maxAgeSeconds: IDLE_MS / 1000 };
}

/** Returns {user, tokenHash} or null. Extends the session (sliding) at most once a minute. */
export async function getSessionUser(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const pool = getPool();
  const th = hashToken(token);
  const { rows } = await pool.query(
    `select u.id, u.email, u.name, s.created_at, s.last_seen_at
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()
        and s.created_at > now() - make_interval(secs => $2)`,
    [th, ABSOLUTE_MS / 1000],
  );
  if (!rows.length) return null;
  const r = rows[0];
  if (Date.now() - new Date(r.last_seen_at).getTime() > 60_000) {
    await pool.query(
      `update sessions set last_seen_at = now(), expires_at = now() + make_interval(secs => $2)
        where token_hash = $1`,
      [th, IDLE_MS / 1000],
    );
  }
  return { user: { id: r.id, email: r.email, name: r.name }, tokenHash: th };
}

export async function deleteSession(tokenHash) {
  await getPool().query('delete from sessions where token_hash = $1', [tokenHash]);
}

export async function deleteAllSessions(client, userId, exceptTokenHash = null) {
  await client.query('delete from sessions where user_id = $1 and token_hash is distinct from $2', [userId, exceptTokenHash]);
}

export async function purgeExpiredSessions() {
  await getPool().query("delete from sessions where expires_at < now()");
  await getPool().query("delete from login_attempts where at < now() - interval '2 days'");
}
