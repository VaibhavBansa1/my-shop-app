// POST {text} from on-device OCR (ML Kit on the phone) -> purchase draft. Only text is uploaded.
import { z } from 'zod';
import { route, readJson } from '../../../../../../../lib/http.js';
import { draftFromText } from '../../../../../../../lib/services/ocr.js';
import { assertUnderLimit, recordAttempt } from '../../../../../../../lib/auth/rate-limit.js';

const body = z.object({ text: z.string().min(1).max(50_000) });

export const POST = route(async ({ request, db, user }) => {
  const { text } = body.parse(await readJson(request));
  await assertUnderLimit(`ocr-text:${user.id}`, { max: 300, windowSeconds: 3600, failuresOnly: false });
  await recordAttempt(`ocr-text:${user.id}`, true);
  return draftFromText(db, text, { engine: 'device' });
}, { action: 'voucher.create.purchase' });
