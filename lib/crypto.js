// Field-level encryption for contact details (phone, email, address) of customers, suppliers and
// businesses: AES-256-GCM with a random IV per value. A database dump or backup without the key
// shows only ciphertext like "enc:v1:…". Amounts are NOT encrypted: the database must add them up
// for reports (they are protected by access control, TLS and disk encryption instead).
//
// DATA_ENCRYPTION_KEY: 32 random bytes, base64. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Required in production. KEEP A COPY SAFE: without it the encrypted fields cannot be read.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY is not set (required in production)');
    return null; // development without a key: values stay readable
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return key;
}

export const encryptionEnabled = () => Boolean(process.env.DATA_ENCRYPTION_KEY);

/** Encrypt a string field; '' and null stay as they are (nothing to hide, keeps "is empty" checks simple). */
export function encryptField(value) {
  if (value === null || value === undefined || value === '') return value ?? '';
  const s = String(value);
  if (s.startsWith(PREFIX)) return s;
  const key = getKey();
  if (!key) return s;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

/** Decrypt a field written by encryptField; plain (legacy/dev) values are returned unchanged. */
export function decryptField(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return '[encrypted]';
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return '[cannot decrypt]';   // wrong key or tampered value: never crash a page over it
  }
}

export const isEncrypted = (v) => typeof v === 'string' && v.startsWith(PREFIX);
