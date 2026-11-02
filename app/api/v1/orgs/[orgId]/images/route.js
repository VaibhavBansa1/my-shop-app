// POST raw image bytes (?kind=item|logo) -> processed WebP variants + signed URLs. Attach the returned id
// to an item (PATCH items/{id} {imageId}) or as the logo (PATCH orgs/{org} {logoImageId}).
import { route, json, readBodyLimited } from '../../../../../../lib/http.js';
import { uploadImage } from '../../../../../../lib/services/imageService.js';
import { MAX_UPLOAD_BYTES } from '../../../../../../lib/images.js';
import { assertUnderLimit, recordAttempt } from '../../../../../../lib/auth/rate-limit.js';
import { badRequest, forbidden } from '../../../../../../lib/errors.js';
import { can } from '../../../../../../lib/permissions.js';

export const runtime = 'nodejs';

export const POST = route(async ({ request, db, role, user }) => {
  const kind = new URL(request.url).searchParams.get('kind');
  if (kind !== 'item' && kind !== 'logo') throw badRequest('kind must be item or logo.');
  if (!can(role, kind === 'logo' ? 'org.update' : 'masters.write')) throw forbidden();
  if (!/^image\//.test(request.headers.get('content-type') || '')) throw badRequest('Send the image bytes with an image/* content type.');
  await assertUnderLimit(`img:${user.id}`, { max: 120, windowSeconds: 3600, failuresOnly: false });
  const buf = await readBodyLimited(request, MAX_UPLOAD_BYTES, 'Image is too large (max 10 MB).');
  await recordAttempt(`img:${user.id}`, true);
  return json(await uploadImage(db, kind, buf), 201);
}, { action: 'org.read' });
