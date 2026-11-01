import { route, readJson, json, clientIp, sessionCookie } from '../../../../../lib/http.js';
import { signupSchema } from '../../../../../lib/validation.js';
import { signup } from '../../../../../lib/services/accounts.js';

export const POST = route(async ({ request }) => {
  const body = signupSchema.parse(await readJson(request));
  const { user, session } = await signup(body, { ip: clientIp(request), userAgent: request.headers.get('user-agent') });
  return json({ user }, 201, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
