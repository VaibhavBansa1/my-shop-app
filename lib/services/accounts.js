// User accounts: sign up, sign in, password change.
import { tx, getPool } from '../db.js';
import { hashPassword, verifyPassword, dummyVerify } from '../auth/password.js';
import { createSession, deleteAllSessions, purgeExpiredSessions } from '../auth/session.js';
import { assertUnderLimit, recordAttempt } from '../auth/rate-limit.js';
import { conflict, unauthorized } from '../errors.js';
import { sendVerification, verificationPolicy } from './verification.js';
import { sendEmail } from '../email.js';
import { welcomeMessage } from '../emailTemplates.js';

export async function signup({ name, email, password }, meta = {}) {
  // Per-IP limits only apply when the real client IP is known (TRUST_PROXY=1 behind a proxy);
  // otherwise every visitor would share one bucket and lock each other out.
  if (meta.ip && meta.ip !== 'unknown') {
    await assertUnderLimit(`signup-ip:${meta.ip}`, { max: 20, windowSeconds: 3600, failuresOnly: false });
    await recordAttempt(`signup-ip:${meta.ip}`, true);
  }
  const passwordHash = await hashPassword(password);
  const result = await tx(async (client) => {
    const existing = await client.query('select 1 from users where email = $1', [email]);
    if (existing.rowCount) throw conflict('An account with this email already exists. Please sign in.');
    const { rows } = await client.query(
      'insert into users (name, email, password_hash) values ($1, $2, $3) returning id, name, email',
      [name, email, passwordHash],
    );
    const session = await createSession(client, rows[0].id, meta);
    return { user: rows[0], session };
  });
  // After commit: email the confirmation link (or a welcome when verification is off). Never fails sign-up.
  if (verificationPolicy() === 'off') sendEmail({ to: email, ...welcomeMessage(name) }).catch(() => {});
  else await sendVerification(result.user.id, meta.origin ?? process.env.APP_ORIGIN?.split(',')[0] ?? '').catch(() => {});
  return result;
}

export async function login({ email, password }, meta = {}) {
  await assertUnderLimit(`email:${email}`, { max: 10, windowSeconds: 900 });
  const ipKnown = meta.ip && meta.ip !== 'unknown';
  if (ipKnown) await assertUnderLimit(`ip:${meta.ip}`, { max: 100, windowSeconds: 900 });
  const { rows } = await getPool().query('select id, name, email, password_hash from users where email = $1', [email]);
  const ok = rows.length ? await verifyPassword(password, rows[0].password_hash) : await dummyVerify(password);
  await recordAttempt(`email:${email}`, ok);
  if (ipKnown) await recordAttempt(`ip:${meta.ip}`, ok);
  if (!ok) throw unauthorized('Email or password is incorrect.');
  const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
  const session = await tx((client) => createSession(client, user.id, meta));
  // Opportunistic housekeeping (also available as `npm run db:cleanup` for a daily cron).
  if (Math.random() < 0.02) purgeExpiredSessions().catch(() => {});
  return { user, session };
}

export async function changePassword(userId, { currentPassword, newPassword }, keepTokenHash) {
  const { rows } = await getPool().query('select password_hash from users where id = $1', [userId]);
  if (!rows.length || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw unauthorized('Current password is incorrect.');
  }
  const hash = await hashPassword(newPassword);
  await tx(async (client) => {
    await client.query('update users set password_hash = $1, updated_at = now() where id = $2', [hash, userId]);
    await deleteAllSessions(client, userId, keepTokenHash); // sign out other devices
  });
}
