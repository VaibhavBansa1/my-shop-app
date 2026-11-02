import { route, clientIp } from '../../../../../../lib/http.js';
import { revokeSession } from '../../../../../../lib/services/sessionsList.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';

export const DELETE = route(async ({ request, user, params, requestId }) => {
  await revokeSession(user.id, String(params.sessionId));
  await securityEvent('session.revoked', { userId: user.id, ip: clientIp(request), requestId, detail: params.sessionId });
  return { ok: true };
});
