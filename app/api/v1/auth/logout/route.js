import { route, json, clearSessionCookie } from '../../../../../lib/http.js';
import { deleteSession } from '../../../../../lib/auth/session.js';

export const POST = route(async ({ tokenHash }) => {
  await deleteSession(tokenHash);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
});
