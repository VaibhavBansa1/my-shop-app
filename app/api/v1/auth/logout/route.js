import { route, json, clearSessionCookie } from '../../../../../lib/http.js';
import { deleteSession } from '../../../../../lib/auth/session.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

export const POST = route(async ({ tokenHash, user }) => {
  await deleteSession(tokenHash);
  await securityEvent('logout', { userId: user.id });
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
});
