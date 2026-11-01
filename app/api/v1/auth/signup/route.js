import { route, readJson, json, clientIp, sessionCookie } from '../../../../../lib/http.js';
import { signupSchema } from '../../../../../lib/validation.js';
import { signup } from '../../../../../lib/services/accounts.js';

export const POST = route(async ({ request }) => {
  const body = signupSchema.parse(await readJson(request));
  const origin = process.env.APP_ORIGIN?.split(',')[0] || new URL(request.url).origin;
  const { user, session } = await signup(body, { ip: clientIp(request), userAgent: request.headers.get('user-agent'), origin });
  // Native apps ask for the token in the body (no cookie), like /auth/login.
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds }, 201);
  return json({ user }, 201, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
