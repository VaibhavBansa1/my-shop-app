// Change the sign-in email: {newEmail, password, code?}. Emails a link to the new address and a warning to the old one.
import { route, readJson, clientIp, publicOrigin } from '../../../../../lib/http.js';
import { emailChangeSchema } from '../../../../../lib/validation.js';
import { requestEmailChange } from '../../../../../lib/services/accountSettings.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

export const POST = route(async ({ request, user, requestId }) => {
  const body = emailChangeSchema.parse(await readJson(request));
  const r = await requestEmailChange(user.id, body, publicOrigin(request));
  await securityEvent('account.email_change_requested', { userId: user.id, ip: clientIp(request), requestId });
  return r;
});
