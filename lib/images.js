// Image processing with sharp (libvips — the fast Node.js equivalent of Python's Pillow):
// validate, auto-rotate from EXIF, strip all metadata (GPS, camera serials), resize into WebP variants.
// Signed URLs let a CDN cache private images: content-addressed keys never change, signatures expire.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { badRequest } from './errors.js';

const require = createRequire(import.meta.url);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);
export const VARIANTS = {
  thumb: { width: 160, height: 160, fit: 'cover' },     // lists (square)
  medium: { width: 640, height: 640, fit: 'inside' },   // forms, invoices
  large: { width: 1280, height: 1280, fit: 'inside' },  // full view
};

/** @returns {Promise<{hash, width, height, bytes, outputs: {[variant]: {buffer, w, h}}}>} */
export async function processImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw badRequest('No image received.');
  if (buf.length > MAX_UPLOAD_BYTES) throw badRequest('Image is too large (max 10 MB).');
  const sharp = require('sharp');
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
  } catch (e) {
    if (/pixel limit/i.test(e.message)) throw badRequest('Image resolution is too large.');
    throw badRequest('That file is not a supported image (use JPEG, PNG, WebP, AVIF or HEIC).');
  }
  if (!FORMATS.has(meta.format)) throw badRequest('Use a JPEG, PNG, WebP, AVIF or HEIC image.');
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS) throw badRequest('Image resolution is too large.');
  const outputs = {};
  for (const [name, v] of Object.entries(VARIANTS)) {
    // .rotate() applies EXIF orientation; sharp writes no metadata unless asked (EXIF/GPS stripped).
    const { data, info } = await sharp(buf, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: v.width, height: v.height, fit: v.fit, withoutEnlargement: true, position: 'attention' })
      .webp({ quality: name === 'thumb' ? 70 : 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    outputs[name] = { buffer: data, w: info.width, h: info.height };
  }
  return { hash: createHash('sha256').update(buf).digest('hex'), width: meta.width, height: meta.height, bytes: buf.length, outputs };
}

// ---------- signed URLs ----------
const DAY = 86400;
function secret() {
  const s = process.env.IMAGE_URL_SECRET || process.env.DATA_ENCRYPTION_KEY;
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('IMAGE_URL_SECRET (or DATA_ENCRYPTION_KEY) is required');
    return 'dev-only-image-secret';
  }
  return s;
}
const base = () => (process.env.IMAGE_BASE_URL || '').replace(/\/+$/, '');   // e.g. https://cdn.example.in (CDN in front of the app)

/**
 * URL valid until the end of the 7th day from now (UTC), rounded to the day: the same URL is handed
 * out all day long, so browsers and the CDN get cache hits instead of re-downloading.
 */
export function signedUrl(key, now = Date.now()) {
  const exp = (Math.floor(now / 1000 / DAY) + 8) * DAY;
  const sig = createHmac('sha256', secret()).update(`${key}:${exp}`).digest('base64url').slice(0, 32);
  return `${base()}/api/img/${key}?e=${exp}&s=${sig}`;
}

export function verifySignature(key, exp, sig, now = Date.now()) {
  if (!/^\d{1,12}$/.test(String(exp)) || typeof sig !== 'string' || sig.length !== 32) return false;
  if (Number(exp) * 1000 < now) return false;
  const want = Buffer.from(createHmac('sha256', secret()).update(`${key}:${exp}`).digest('base64url').slice(0, 32));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** {thumb, medium, large} signed URLs for an images row's variants. */
export function imageUrls(variants) {
  if (!variants) return null;
  return Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, signedUrl(v.key)]));
}
