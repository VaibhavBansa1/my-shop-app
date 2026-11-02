// Upload / attach images for a business. Files go to storage; rows in `images` (RLS per business).
import { createHash, randomBytes } from 'node:crypto';
import { withOrg, getPool } from '../db.js';
import { audit } from './audit.js';
import { processImage, imageUrls } from '../images.js';
import { putObject, deleteObject } from '../storage.js';
import { log } from '../log.js';

export async function uploadImage(db, kind, buf) {
  const img = await processImage(buf);
  // Same picture uploaded again -> reuse it (no duplicate storage).
  const existing = await withOrg(db, async (c) => (await c.query('select id, variants from images where kind = $1 and hash = $2', [kind, img.hash])).rows[0]);
  if (existing) return { id: existing.id, urls: imageUrls(existing.variants), reused: true };
  const variants = {};
  // Storage keys are unique per upload (not the content hash), so the cleanup job deleting an old unused copy
  // can never delete the files of a new upload of the same picture (found in security review round 2).
  const fileId = createHash('sha256').update(img.hash).update(randomBytes(16)).digest('hex');
  for (const [name, o] of Object.entries(img.outputs)) {
    const key = `org/${db.orgId}/${fileId}-${kind}-${name}.webp`;
    await putObject(key, o.buffer, 'image/webp');
    variants[name] = { key, w: o.w, h: o.h, bytes: o.buffer.length };
  }
  return withOrg(db, async (c) => {
    await c.query(
      `insert into images (org_id, kind, hash, width, height, bytes, variants, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (org_id, kind, hash) do nothing`,   // two uploads racing: keep the first
      [db.orgId, kind, img.hash, img.width, img.height, img.bytes, variants, db.userId]);
    const { rows } = await c.query('select id, variants from images where kind = $1 and hash = $2', [kind, img.hash]);
    await audit(c, db, 'image.upload', 'image', rows[0].id, { kind, bytes: img.bytes });
    return { id: rows[0].id, urls: imageUrls(rows[0].variants), reused: false };
  });
}

/** Cleanup job: delete images nobody uses any more (older than a day) and their files. */
export async function purgeOrphanImages() {
  const { rows } = await getPool().query("select * from orphan_images(interval '1 day')");
  for (const r of rows) {
    try {
      // Row first (the database re-checks it is still unused), files only if the row was really deleted.
      const { rows: d } = await getPool().query("select delete_image($1, interval '1 day') as deleted", [r.id]);
      if (!d[0].deleted) continue;
      for (const v of Object.values(r.variants)) await deleteObject(v.key);
    } catch (e) { log.warn('orphan image purge failed', { id: r.id, error: e.message }); }
  }
  return rows.length;
}
