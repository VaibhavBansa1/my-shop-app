// POST raw image bytes (Content-Type: image/jpeg or image/png) -> purchase draft.
import { route, json } from '../../../../../../../lib/http.js';
import { recognize, draftFromText, MAX_IMAGE_BYTES } from '../../../../../../../lib/services/ocr.js';
import { assertUnderLimit, recordAttempt } from '../../../../../../../lib/auth/rate-limit.js';
import { badRequest } from '../../../../../../../lib/errors.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = route(async ({ request, db, user }) => {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!/^image\/(jpeg|png)\b/.test(type)) throw badRequest('Send the photo as image/jpeg or image/png.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE_BYTES) throw badRequest('Image is too large (max 8 MB).');
  await assertUnderLimit(`ocr-image:${user.id}`, { max: 60, windowSeconds: 3600, failuresOnly: false });
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('Image is too large (max 8 MB).');
  await recordAttempt(`ocr-image:${user.id}`, true);
  const { text, confidence } = await recognize(buf);
  return json(await draftFromText(db, text, { engine: 'server-tesseract', confidence }));
}, { action: 'voucher.create.purchase' });
