// Email verification. Policy from EMAIL_VERIFICATION: 'required' | 'optional' | 'off'.
// Default: 'required' when an email provider is configured, otherwise 'off' (so a fresh local
// install still works without mail). 'required' blocks creating/joining a business until verified.
import { randomBytes } from 'node:crypto';
import { getPool, tx } from '../db.js';
import { hashToken } from '../auth/session.js';
import { assertUnderLimit, recordAttempt } from '../auth/rate-limit.js';
import { emailConfigured, sendEmail } from '../email.js';
import { verifyEmailMessage, welcomeMessage } from '../emailTemplates.js';
import { badRequest, forbidden } from '../errors.js';

export function verificationPolicy() {
  const p = (process.env.EMAIL_VERIFICATION || '').toLowerCase();
  if (['required', 'optional', 'off'].includes(p)) return p;
  return emailConfigured() ? 'required' : 'off';
}

export async function sendVerification(userId, origin) {
  if (verificationPolicy() === 'off') return { sent: false };
  const { rows } = await getPool().query('select name, email, email_verified_at from users where id = $1', [userId]);
  if (!rows.length || rows[0].email_verified_at) return { sent: false };
  await assertUnderLimit(`verify:${userId}`, { max: 5, windowSeconds: 3600, failuresOnly: false });
  await recordAttempt(`verify:${userId}`, true);
  const token = randomBytes(32).toString('base64url');
  await getPool().query(
    "insert into email_verifications (token_hash, user_id, expires_at) values ($1, $2, now() + interval '24 hours')",
    [hashToken(token), userId]);
  await sendEmail({ to: rows[0].email, ...verifyEmailMessage(rows[0].name, `${origin}/verify#${token}`) });
  return { sent: true };
}

export async function confirmVerification(token) {
  const user = await tx(async (c) => {
    const { rows } = await c.query(
      `update email_verifications set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now() returning user_id`, [hashToken(token)]);
    if (!rows.length) throw badRequest('This confirmation link is invalid, already used, or expired. Ask for a new one.');
    const u = await c.query(
      'update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1 returning name, email',
      [rows[0].user_id]);
    return u.rows[0];
  });
  await sendEmail({ to: user.email, ...welcomeMessage(user.name) });
  return { ok: true };
}

export async function isVerified(userId) {
  const { rows } = await getPool().query('select email_verified_at from users where id = $1', [userId]);
  return Boolean(rows[0]?.email_verified_at);
}

/** Throws 403 when the policy requires verification and the user has not verified. */
export async function requireVerified(userId) {
  if (verificationPolicy() !== 'required') return;
  if (!(await isVerified(userId))) {
    throw forbidden('Please confirm your email address first. Check your inbox, or ask for a new link.');
  }
}
