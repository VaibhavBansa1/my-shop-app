// The link from the "confirm your new email" message. Works without being signed in (it may open on another device).
import { z } from 'zod';
import { route, readJson, clientIp } from '../../../../../../lib/http.js';
import { confirmEmailChange } from '../../../../../../lib/services/accountSettings.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';

export const POST = route(async ({ request, requestId }) => {
  const { token } = z.object({ token: z.string().min(20).max(100) }).parse(await readJson(request));
  const r = await confirmEmailChange(token);
  await securityEvent('account.email_changed', { userId: r.userId, ip: clientIp(request), requestId });
  return { ok: true, email: r.newEmail };
}, { auth: false });
