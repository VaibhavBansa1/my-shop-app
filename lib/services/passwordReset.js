// Password reset by emailed one-time link. Responses never reveal whether an email exists.
import { randomBytes } from 'node:crypto';
import { getPool, tx } from '../db.js';
import { hashToken, deleteAllSessions } from '../auth/session.js';
import { hashPassword } from '../auth/password.js';
import { assertUnderLimit, recordAttempt } from '../auth/rate-limit.js';
import { sendEmail } from '../email.js';
import { resetMessage } from '../emailTemplates.js';
import { badRequest } from '../errors.js';

const TTL_MINUTES = 30;

export async function requestReset(email, { origin, ip } = {}) {
  await assertUnderLimit(`reset-email:${email}`, { max: 3, windowSeconds: 3600, failuresOnly: false });
  if (ip && ip !== 'unknown') await assertUnderLimit(`reset-ip:${ip}`, { max: 20, windowSeconds: 3600, failuresOnly: false });
  await recordAttempt(`reset-email:${email}`, true);
  if (ip && ip !== 'unknown') await recordAttempt(`reset-ip:${ip}`, true);

  const { rows } = await getPool().query('select id, name from users where email = $1', [email]);
  if (!rows.length) return; // same outward behaviour as success
  const token = randomBytes(32).toString('base64url');
  await getPool().query(
    `insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(mins => $3))`,
    [hashToken(token), rows[0].id, TTL_MINUTES]);
  await sendEmail({ to: email, ...resetMessage(rows[0].name, `${origin}/reset#${token}`, TTL_MINUTES) });
}

export async function confirmReset(token, newPassword) {
  const hash = await hashPassword(newPassword);
  return tx(async (c) => {
    const { rows } = await c.query(
      `update password_resets set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
        returning user_id`, [hashToken(token)]);
    if (!rows.length) throw badRequest('This reset link is invalid, already used, or expired. Ask for a new one.');
    const userId = rows[0].user_id;
    await c.query('update users set password_hash = $1, updated_at = now() where id = $2', [hash, userId]);
    await c.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [userId]);
    await deleteAllSessions(c, userId); // sign out everywhere
    return { ok: true };
  });
}
