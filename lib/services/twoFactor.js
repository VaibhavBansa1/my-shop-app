// Two-factor login: authenticator-app codes plus 10 one-time recovery codes.
import { createHash, randomBytes } from 'node:crypto';
import { getPool, tx } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { reserveFailure } from '../auth/rate-limit.js';
import { newSecret, otpauthUri, verifyTotp, base32Encode } from '../auth/totp.js';
import { encryptField as enc, decryptField as dec } from '../crypto.js';
import { AppError, badRequest, unauthorized } from '../errors.js';

const hashCode = (c) => createHash('sha256').update(String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest();
const RECOVERY_RE = /^[a-z2-7]{5}-?[a-z2-7]{5}$/i;

async function checkPassword(userId, password) {
  const hold = await reserveFailure(`pwcheck:${userId}`, { max: 5, windowSeconds: 900 });
  const { rows } = await getPool().query('select password_hash from users where id = $1', [userId]);
  if (!rows.length || !(await verifyPassword(password ?? '', rows[0].password_hash))) throw unauthorized('Password is incorrect.');
  await hold.succeeded();
}

export async function twoFactorStatus(userId) {
  const { rows } = await getPool().query(
    `select totp_enabled_at, (select count(*)::int from recovery_codes r where r.user_id = u.id and r.used_at is null) as left
       from users u where id = $1`, [userId]);
  return { enabled: Boolean(rows[0]?.totp_enabled_at), enabledAt: rows[0]?.totp_enabled_at ?? null, recoveryCodesLeft: rows[0]?.left ?? 0 };
}

/** Step 1: confirm the password, create a secret (not active until a code proves the app has it). */
export async function startSetup(userId, password) {
  await checkPassword(userId, password);
  const { rows } = await getPool().query('select email, totp_enabled_at from users where id = $1', [userId]);
  if (rows[0].totp_enabled_at) throw badRequest('Two-step login is already on.');
  const secret = newSecret();
  await getPool().query('update users set totp_pending = $2 where id = $1', [userId, enc(secret)]);
  return { secret, uri: otpauthUri(secret, rows[0].email) };
}

function makeRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const s = base32Encode(randomBytes(7)).toLowerCase().slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
async function storeRecoveryCodes(c, userId) {
  const codes = makeRecoveryCodes();
  await c.query('delete from recovery_codes where user_id = $1', [userId]);
  for (const code of codes) await c.query('insert into recovery_codes (user_id, code_hash) values ($1, $2)', [userId, hashCode(code)]);
  return codes;
}

/** Step 2: a correct code from the app turns 2FA on. Returns the recovery codes (shown once). */
export async function enableTwoFactor(userId, code) {
  const hold = await reserveFailure(`mfa:${userId}`, { max: 5, windowSeconds: 900 });
  return tx(async (c) => {
    const { rows } = await c.query('select totp_pending, totp_enabled_at from users where id = $1 for update', [userId]);
    if (rows[0].totp_enabled_at) throw badRequest('Two-step login is already on.');
    if (!rows[0].totp_pending) throw badRequest('Start the setup again.');
    const secret = dec(rows[0].totp_pending);
    const step = verifyTotp(secret, code);
    if (step == null) throw badRequest('That code is not right. Check the time on your phone and try the newest code.');
    await hold.succeeded();
    await c.query(`update users set totp_secret = totp_pending, totp_pending = null, totp_enabled_at = now(), totp_last_step = $2
                    where id = $1`, [userId, step]);
    return { recoveryCodes: await storeRecoveryCodes(c, userId) };
  });
}

/**
 * Check a second-factor code at sign-in (or before a sensitive change): a 6-digit app code, or a recovery code.
 * 5 wrong codes per 15 minutes per account. Each app code and each recovery code works only once.
 * @returns {'totp'|'recovery'}
 */
export async function verifySecondFactor(userId, code) {
  const hold = await reserveFailure(`mfa:${userId}`, { max: 5, windowSeconds: 900 });
  const value = String(code ?? '').trim();
  if (RECOVERY_RE.test(value)) {
    const r = await getPool().query(
      'update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id', [userId, hashCode(value)]);
    if (!r.rowCount) throw new AppError(401, 'mfa_invalid', 'That recovery code is not valid or was already used.');
    await hold.succeeded();
    return 'recovery';
  }
  const { rows } = await getPool().query('select totp_secret, totp_last_step from users where id = $1', [userId]);
  if (!rows[0]?.totp_secret) throw badRequest('Two-step login is not on.');
  const step = verifyTotp(dec(rows[0].totp_secret), value, { lastStep: rows[0].totp_last_step == null ? null : Number(rows[0].totp_last_step) });
  // The update also refuses a step already used by a parallel request (same code sent twice at once).
  const ok = step != null && (await getPool().query(
    'update users set totp_last_step = $2 where id = $1 and (totp_last_step is null or totp_last_step < $2)', [userId, step])).rowCount === 1;
  if (!ok) throw new AppError(401, 'mfa_invalid', 'That code is not right. Use the newest code from your authenticator app.');
  await hold.succeeded();
  return 'totp';
}

export async function hasTwoFactor(userId) {
  const { rows } = await getPool().query('select totp_enabled_at is not null as on from users where id = $1', [userId]);
  return Boolean(rows[0]?.on);
}

/** Turn off: needs the password AND a current code (or a recovery code). */
export async function disableTwoFactor(userId, { password, code }) {
  await checkPassword(userId, password);
  await verifySecondFactor(userId, code);
  await tx(async (c) => {
    await c.query('update users set totp_secret = null, totp_pending = null, totp_enabled_at = null, totp_last_step = null where id = $1', [userId]);
    await c.query('delete from recovery_codes where user_id = $1', [userId]);
  });
}

/** New set of recovery codes (old ones stop working). Needs the password and a current code. */
export async function regenerateRecoveryCodes(userId, { password, code }) {
  await checkPassword(userId, password);
  await verifySecondFactor(userId, code);
  return tx(async (c) => ({ recoveryCodes: await storeRecoveryCodes(c, userId) }));
}
