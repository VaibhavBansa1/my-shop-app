// The signed-in person's own account: name, email change (confirm the new address, alert the old one), deletion.
import { randomBytes } from 'node:crypto';
import { getPool, tx, withOrg } from '../db.js';
import { hashToken, deleteAllSessions } from '../auth/session.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { reserveFailure, assertUnderLimit, recordAttempt } from '../auth/rate-limit.js';
import { verifySecondFactor } from './twoFactor.js';
import { deliverEmail as sendEmail } from '../email.js';
import { emailChangeConfirmMessage, emailChangeAlertMessage, emailChangedMessage, accountDeletedMessage } from '../emailTemplates.js';
import { AppError, badRequest, conflict, unauthorized } from '../errors.js';

/** Password (and the two-step code when it is on) before changing the sign-in email or deleting the account. */
async function reauth(userId, { password, code }) {
  const hold = await reserveFailure(`pwcheck:${userId}`, { max: 5, windowSeconds: 900 });
  const { rows } = await getPool().query('select password_hash, totp_enabled_at from users where id = $1', [userId]);
  if (!rows.length || !(await verifyPassword(password ?? '', rows[0].password_hash))) throw unauthorized('Password is incorrect.');
  await hold.succeeded();
  if (rows[0].totp_enabled_at) {
    if (!code) throw new AppError(401, 'mfa_required', 'Enter the code from your authenticator app.');
    await verifySecondFactor(userId, code);
  }
}

export async function updateName(userId, name) {
  await getPool().query('update users set name = $2, updated_at = now() where id = $1', [userId, name]);
  return { ok: true };
}

/**
 * Step 1: email a confirmation link to the NEW address and a warning to the OLD one. Nothing changes until the
 * link is used, so a typo or a stolen session cannot quietly take over the account's email.
 */
export async function requestEmailChange(userId, { newEmail, password, code }, origin) {
  await reauth(userId, { password, code });
  await assertUnderLimit(`email-change:${userId}`, { max: 3, windowSeconds: 3600, failuresOnly: false });
  await recordAttempt(`email-change:${userId}`, true);
  const { rows } = await getPool().query('select name, email from users where id = $1', [userId]);
  if (rows[0].email.toLowerCase() === newEmail.toLowerCase()) throw badRequest('That is already your email.');
  const taken = await getPool().query('select 1 from users where email = $1', [newEmail]);
  // Same answer whether or not the address is taken (no account discovery); the confirm step re-checks.
  const token = randomBytes(32).toString('base64url');
  await getPool().query('delete from email_changes where user_id = $1 and used_at is null', [userId]);
  await getPool().query(`insert into email_changes (token_hash, user_id, new_email, expires_at) values ($1, $2, $3, now() + interval '24 hours')`,
    [hashToken(token), userId, newEmail]);
  if (!taken.rowCount) await sendEmail({ to: newEmail, ...emailChangeConfirmMessage(rows[0].name, `${origin}/confirm-email#${token}`) });
  await sendEmail({ to: rows[0].email, ...emailChangeAlertMessage(rows[0].name, newEmail) });
  return { sent: true };
}

/** Step 2 (from the link, signed in or not): switch the email, sign out other devices, tell the old address. */
export async function confirmEmailChange(token) {
  const r = await tx(async (c) => {
    const { rows } = await c.query(
      `update email_changes set used_at = now() where token_hash = $1 and used_at is null and expires_at > now()
        returning user_id, new_email`, [hashToken(token)]);
    if (!rows.length) throw badRequest('This link is invalid, already used, or expired. Ask for a new one in Settings.');
    const { user_id: userId, new_email: newEmail } = rows[0];
    const old = (await c.query('select name, email from users where id = $1 and deleted_at is null for update', [userId])).rows[0];
    if (!old) throw badRequest('This account no longer exists.');
    if ((await c.query('select 1 from users where email = $1 and id <> $2', [newEmail, userId])).rowCount) {
      throw conflict('Another account already uses that email.');
    }
    await c.query('update users set email = $2, email_verified_at = now(), updated_at = now() where id = $1', [userId, newEmail]);
    await deleteAllSessions(c, userId);   // sign out everywhere: whoever had a session must sign in with the new email
    await c.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [userId]);
    return { userId, oldEmail: old.email, newEmail, name: old.name };
  });
  sendEmail({ to: r.oldEmail, ...emailChangedMessage(r.name, r.newEmail) }).catch(() => {});
  return r;
}

/** Businesses that block deletion (this person is their only owner). */
export async function soleOwnerBusinesses(userId) {
  return withOrg({ userId }, async (c) => (await c.query('select org_id as id, name from sole_owner_orgs()')).rows);
}

/**
 * Delete the account. Personal details are wiped and sign-in is impossible; the row stays because businesses'
 * bills and activity logs refer to it (accounting records must be kept) and show "Deleted user".
 */
export async function deleteAccount(userId, { password, code, confirm }) {
  if (confirm !== 'DELETE') throw badRequest('Type DELETE to confirm.');
  await reauth(userId, { password, code });
  const blocking = await soleOwnerBusinesses(userId);
  if (blocking.length) {
    throw new AppError(409, 'sole_owner', `You are the only owner of: ${blocking.map((b) => b.name).join(', ')}. Delete those businesses or make someone else an owner first.`,
      { businesses: blocking });
  }
  const { rows } = await getPool().query('select name, email from users where id = $1', [userId]);
  const unusable = await hashPassword(randomBytes(32).toString('base64url'));
  await withOrg({ userId }, async (c) => {
    await c.query('select leave_all_orgs()');
    await deleteAllSessions(c, userId);
    for (const t of ['recovery_codes', 'email_changes', 'password_resets', 'email_verifications']) await c.query(`delete from ${t} where user_id = $1`, [userId]);
    await c.query(`update users set name = 'Deleted user', email = $2, password_hash = $3, email_verified_at = null,
                    totp_secret = null, totp_pending = null, totp_enabled_at = null, totp_last_step = null, deleted_at = now(), updated_at = now()
                    where id = $1`, [userId, `deleted-${userId}@deleted.invalid`, unusable]);
  });
  sendEmail({ to: rows[0].email, ...accountDeletedMessage(rows[0].name) }).catch(() => {});
  return { ok: true };
}
