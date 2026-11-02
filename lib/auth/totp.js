// Time-based one-time passwords (RFC 6238 / RFC 4226): HMAC-SHA1, 30-second steps, 6 digits.
// Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export const newSecret = () => base32Encode(randomBytes(20));   // 160-bit secret, as RFC 4226 recommends

export function hotp(secret, counter) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(c).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
export const stepAt = (now = Date.now()) => Math.floor(now / 30_000);

/**
 * Check a 6-digit code, allowing one step of clock drift either way.
 * Returns the matching step (so the caller can refuse it next time), or null.
 */
export function verifyTotp(secret, code, { now = Date.now(), lastStep = null } = {}) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepAt(now);
  for (const step of [s - 1, s, s + 1]) {
    if (lastStep != null && step <= lastStep) continue;   // replay of an already used code
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUri(secret, account, issuer = process.env.APP_NAME || 'My Shop') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
