import { z } from 'zod';
import { route, readJson } from '../../../../../../lib/http.js';
import { confirmVerification } from '../../../../../../lib/services/verification.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';

export const POST = route(async ({ request }) => {
  const { token } = z.object({ token: z.string().min(20).max(100) }).parse(await readJson(request));
  const r = await confirmVerification(token);
  await securityEvent('email.verified', { userId: r.userId });
  return { ok: true };
}, { auth: false });
