import { route, readJson, json, clientIp, sessionCookie, publicOrigin } from '../../../../../lib/http.js';
import { signupSchema } from '../../../../../lib/validation.js';
import { signup } from '../../../../../lib/services/accounts.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

export const POST = route(async ({ request }) => {
  const body = signupSchema.parse(await readJson(request));
  const origin = publicOrigin(request);
  const { user, session } = await signup(body, { ip: clientIp(request), userAgent: request.headers.get('user-agent'), origin });
  await securityEvent('signup', { userId: user.id, ip: clientIp(request), userAgent: request.headers.get('user-agent') });
  // Native apps ask for the token in the body (no cookie), like /auth/login.
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds }, 201);
  return json({ user }, 201, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
