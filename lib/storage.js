// File storage for images. STORAGE_DRIVER=local (default) | s3
//   local: STORAGE_DIR (default ./data/uploads) — mount a volume in Docker/Kubernetes.
//   s3:    any S3-compatible service (AWS S3, Cloudflare R2, MinIO, Backblaze B2, DigitalOcean Spaces):
//          S3_BUCKET, S3_REGION (auto for R2), S3_ENDPOINT (non-AWS), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
//          S3_FORCE_PATH_STYLE=1 (MinIO). Turn on server-side encryption in the bucket settings.
// Keys look like org/<orgId>/<sha256>-<kind>-<variant>.webp and are never built from user input.
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const KEY_RE = /^org\/[0-9a-f-]{36}\/[0-9a-f]{64}-(item|logo)-(thumb|medium|large)\.webp$/;
export const isValidKey = (k) => typeof k === 'string' && KEY_RE.test(k);
const driver = () => (process.env.STORAGE_DRIVER || 'local').toLowerCase();

function localPath(key) {
  if (!isValidKey(key)) throw new Error('invalid storage key');
  // turbopackIgnore: runtime path, not a build input (keeps the standalone bundle small)
  const root = path.resolve(process.env.STORAGE_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'uploads'));
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error('invalid storage path');
  return p;
}

let s3 = null;
function s3client() {
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3 = new S3Client({
      region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
      credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : undefined,
    });
  }
  return s3;
}

export async function putObject(key, body, contentType) {
  if (!isValidKey(key)) throw new Error('invalid storage key');
  if (driver() === 's3') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable' }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body, { flag: 'w' });
}

/** Returns a Buffer or null when missing. */
export async function getObject(key) {
  if (!isValidKey(key)) return null;
  try {
    if (driver() === 's3') {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const r = await s3client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body.transformToByteArray());
    }
    return await readFile(localPath(key));
  } catch (e) {
    if (e.code === 'ENOENT' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function deleteObject(key) {
  if (!isValidKey(key)) return;
  if (driver() === 's3') {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await s3client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
}
