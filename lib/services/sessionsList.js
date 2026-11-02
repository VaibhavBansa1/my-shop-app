// "Where am I signed in?" — a user's own sessions, with sign-out per device.
import { getPool } from '../db.js';
import { notFound } from '../errors.js';

export async function listSessions(userId, currentHash) {
  const { rows } = await getPool().query(
    `select token_hash, created_at, last_seen_at, ip, user_agent from sessions
      where user_id = $1 and expires_at > now() order by last_seen_at desc`, [userId]);
  return rows.map((r) => ({ id: r.token_hash.toString('hex').slice(0, 16), createdAt: r.created_at, lastSeenAt: r.last_seen_at,
    ip: r.ip, device: r.user_agent, current: Buffer.compare(r.token_hash, currentHash) === 0 }));
}

export async function revokeSession(userId, id) {
  if (!/^[0-9a-f]{16}$/.test(id)) throw notFound('Session not found.');
  const r = await getPool().query(`delete from sessions where user_id = $1 and encode(token_hash, 'hex') like $2 || '%'`, [userId, id]);
  if (!r.rowCount) throw notFound('Session not found.');
}
