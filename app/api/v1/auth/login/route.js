import { route, readJson, json, clientIp, sessionCookie } from '../../../../../lib/http.js';
import { loginSchema } from '../../../../../lib/validation.js';
import { login } from '../../../../../lib/services/accounts.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';
import { getPool } from '../../../../../lib/db.js';

// Browsers get an HttpOnly cookie. Native apps pass {"returnToken": true} and use
// the token as "Authorization: Bearer <token>".
export const POST = route(async ({ request }) => {
  const body = loginSchema.parse(await readJson(request));
  const meta = { ip: clientIp(request), userAgent: request.headers.get('user-agent') };
  let result;
  try { result = await login(body, meta); }
  catch (e) {
    // Attach the attempt to the account it targeted (if any), so its owner sees it in Settings → Security.
    const target = (await getPool().query('select id from users where email = $1', [body.email]).catch(() => ({ rows: [] }))).rows[0]?.id ?? null;
    await securityEvent(e.status === 429 ? 'login.throttled' : 'login.failure', { ...meta, userId: target, detail: `email=${body.email}` });
    throw e;
  }
  const { user, session } = result;
  await securityEvent('login.success', { ...meta, userId: user.id, detail: body.returnToken ? 'app' : 'web' });
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds });
  return json({ user }, 200, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
