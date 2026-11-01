import { route, readJson, json, clientIp, sessionCookie } from '../../../../../lib/http.js';
import { loginSchema } from '../../../../../lib/validation.js';
import { login } from '../../../../../lib/services/accounts.js';

// Browsers get an HttpOnly cookie. Native apps pass {"returnToken": true} and use
// the token as "Authorization: Bearer <token>".
export const POST = route(async ({ request }) => {
  const body = loginSchema.parse(await readJson(request));
  const { user, session } = await login(body, { ip: clientIp(request), userAgent: request.headers.get('user-agent') });
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds });
  return json({ user }, 200, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
