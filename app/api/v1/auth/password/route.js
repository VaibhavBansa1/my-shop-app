import { route, readJson, clientIp } from '../../../../../lib/http.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';
import { changePasswordSchema } from '../../../../../lib/validation.js';
import { changePassword } from '../../../../../lib/services/accounts.js';

export const POST = route(async ({ request, user, tokenHash }) => {
  const body = changePasswordSchema.parse(await readJson(request));
  await changePassword(user.id, body, tokenHash);
  await securityEvent('password.changed', { userId: user.id, ip: clientIp(request) });
  return { ok: true };
});
