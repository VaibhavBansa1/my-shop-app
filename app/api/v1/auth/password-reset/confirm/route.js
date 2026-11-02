import { z } from 'zod';
import { route, readJson, clientIp } from '../../../../../../lib/http.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';
import { password } from '../../../../../../lib/validation.js';
import { confirmReset } from '../../../../../../lib/services/passwordReset.js';

export const POST = route(async ({ request }) => {
  const body = z.object({ token: z.string().min(20).max(100), newPassword: password }).parse(await readJson(request));
  const r = await confirmReset(body.token, body.newPassword);
  await securityEvent('password.reset_done', { userId: r.userId, ip: clientIp(request) });
  return { ok: true };
}, { auth: false });
