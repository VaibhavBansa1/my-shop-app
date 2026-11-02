import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

const STORE = mkdtempSync(path.join(tmpdir(), 'myshop-img-'));
process.env.STORAGE_DIR = STORE;
process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
before(setupDb);
after(async () => { rmSync(STORE, { recursive: true, force: true }); await closePool(); });
const photo = readFileSync(new URL('./fixtures/photo-exif.jpg', import.meta.url));
const invoicePng = readFileSync(new URL('./fixtures/invoice-sample.png', import.meta.url));

test('sharp pipeline: auto-rotate, strip EXIF/GPS, WebP variants, limits', async () => {
  const { processImage } = await import('../lib/images.js');
  const sharp = (await import('sharp')).default;
  const r = await processImage(photo);
  assert.equal(r.hash.length, 64);
  assert.deepEqual([r.width, r.height], [3000, 2000]);
  const large = r.outputs.large;
  assert.deepEqual([large.w, large.h], [853, 1280], 'EXIF orientation 6 applied: portrait after rotation, max 1280');
  assert.deepEqual([r.outputs.thumb.w, r.outputs.thumb.h], [160, 160]);
  const meta = await sharp(large.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined, 'EXIF removed');
  assert.ok(!large.buffer.includes('TestCam'), 'camera make removed');
  assert.ok(large.buffer.length < photo.length, 'smaller than the upload');
  const small = await processImage(invoicePng);
  assert.ok(small.outputs.large.w <= 900, 'never enlarged');
  await assert.rejects(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /JPEG, PNG/);
  await assert.rejects(processImage(Buffer.from('not an image')), /not a supported image/);
  await assert.rejects(processImage(Buffer.alloc(11 * 1024 * 1024)), /too large/);
  // decompression bomb: tiny file claiming a huge canvas
  const bomb = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
  await assert.rejects(processImage(bomb), /resolution is too large/);
});

test('signed URLs: valid, tamper-proof, expire, stable within a day', async () => {
  const { signedUrl, verifySignature } = await import('../lib/images.js');
  const key = `org/${'1'.repeat(8)}-1111-4111-8111-${'1'.repeat(12)}/${'a'.repeat(64)}-item-thumb.webp`;
  const u = new URL(signedUrl(key), 'http://x');
  const exp = u.searchParams.get('e'); const sig = u.searchParams.get('s');
  assert.ok(verifySignature(key, exp, sig));
  assert.ok(!verifySignature(key.replace('thumb', 'large'), exp, sig), 'signature bound to the key');
  assert.ok(!verifySignature(key, String(Number(exp) + 86400), sig), 'expiry cannot be extended');
  assert.ok(!verifySignature(key, exp, sig, (Number(exp) + 1) * 1000), 'expired URLs refused');
  const t = Date.UTC(2026, 10, 2, 1); const t2 = Date.UTC(2026, 10, 2, 22);
  assert.equal(signedUrl(key, t), signedUrl(key, t2), 'same URL all day -> cache hits');
});

test('upload, dedupe, attach to item and logo, serve with caching headers, tenant isolation', async () => {
  const { uploadImage, purgeOrphanImages } = await import('../lib/services/imageService.js');
  const m = await import('../lib/services/masters.js');
  const { updateOrg, getOrg } = await import('../lib/services/orgs.js');
  const { GET } = await import('../app/api/img/[...key]/route.js');
  const { withOrg } = await import('../lib/db.js');
  const a = await makeUserOrg(); const b = await makeUserOrg();
  const up = await uploadImage(a.db, 'item', photo);
  assert.ok(up.urls.thumb && up.urls.medium && up.urls.large);
  const again = await uploadImage(a.db, 'item', photo);
  assert.equal(again.id, up.id); assert.equal(again.reused, true);
  const pcs = (await m.listUnits(a.db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(a.db, { name: 'Pen', unitId: pcs, imageId: up.id });
  assert.ok(item.image.thumb.includes('/api/img/org/'));
  const logo = await uploadImage(a.db, 'logo', invoicePng);
  await updateOrg(a.db, { logoImageId: logo.id });
  assert.ok((await getOrg(a.db)).logo.medium);
  // Another business cannot attach A's image (composite foreign key) nor see it.
  await assert.rejects(m.createItem(b.db, { name: 'Stolen', unitId: (await m.listUnits(b.db))[0].id, imageId: up.id }));
  assert.equal((await withOrg(b.db, (c) => c.query('select count(*)::int n from images'))).rows[0].n, 0);
  // Serving
  const url = new URL(item.image.thumb, 'http://x');
  const key = url.pathname.replace('/api/img/', '');
  const res = await GET(new Request(url), { params: Promise.resolve({ key: key.split('/') }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.match(res.headers.get('cache-control'), /public, max-age=\d+, immutable/);
  const etag = res.headers.get('etag');
  const res304 = await GET(new Request(url, { headers: { 'if-none-match': etag } }), { params: Promise.resolve({ key: key.split('/') }) });
  assert.equal(res304.status, 304, 'revalidation without re-sending the image');
  const bad = await GET(new Request(`http://x/api/img/${key}?e=${url.searchParams.get('e')}&s=${'A'.repeat(32)}`), { params: Promise.resolve({ key: key.split('/') }) });
  assert.equal(bad.status, 404);
  const trav = await GET(new Request('http://x/api/img/../../etc/passwd?e=1&s=x'), { params: Promise.resolve({ key: ['..', '..', 'etc', 'passwd'] }) });
  assert.equal(trav.status, 404, 'path traversal refused');
  // Orphans: an unused upload is purged after a day (simulate age); used ones stay.
  const unused = await uploadImage(a.db, 'item', invoicePng);
  await withOrg(a.db, (c) => c.query("update images set created_at = now() - interval '2 days' where id = any($1::uuid[])", [[unused.id, up.id]])).catch(() => {});
  const { default: pg } = await import('pg');
  const { OWNER_URL } = await import('./helpers.js');
  const oc = new pg.Client({ connectionString: OWNER_URL }); await oc.connect();
  await oc.query("update images set created_at = now() - interval '2 days'"); await oc.end();
  const purged = await purgeOrphanImages();
  assert.ok(purged >= 1);
  const left = (await withOrg(a.db, (c) => c.query('select id from images'))).rows.map((r) => r.id);
  assert.ok(left.includes(up.id) && left.includes(logo.id) && !left.includes(unused.id));
});
