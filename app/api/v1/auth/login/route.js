import { route, readJson, json, clientIp, sessionCookie } from '../../../../../lib/http.js';
import { loginSchema } from '../../../../../lib/validation.js';
import { login } from '../../../../../lib/services/accounts.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

// Browsers get an HttpOnly cookie. Native apps pass {"returnToken": true} and use
// the token as "Authorization: Bearer <token>".
export const POST = route(async ({ request }) => {
  const body = loginSchema.parse(await readJson(request));
  const meta = { ip: clientIp(request), userAgent: request.headers.get('user-agent') };
  let result;
  try { result = await login(body, meta); }
  catch (e) {
    await securityEvent(e.status === 429 ? 'login.throttled' : 'login.failure', { ...meta, detail: `email=${body.email}` });
    throw e;
  }
  const { user, session } = result;
  await securityEvent('login.success', { ...meta, userId: user.id, detail: body.returnToken ? 'app' : 'web' });
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds });
  return json({ user }, 200, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
