import { route, clientIp } from '../../../../../lib/http.js';
import { listSessions } from '../../../../../lib/services/sessionsList.js';
import { deleteAllSessions } from '../../../../../lib/auth/session.js';
import { tx } from '../../../../../lib/db.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

export const GET = route(async ({ user, tokenHash }) => ({ sessions: await listSessions(user.id, tokenHash) }));
// Sign out all OTHER devices.
export const DELETE = route(async ({ request, user, tokenHash, requestId }) => {
  await tx((c) => deleteAllSessions(c, user.id, tokenHash));
  await securityEvent('sessions.revoked_all', { userId: user.id, ip: clientIp(request), requestId });
  return { ok: true };
});
