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
    const kind = e.status === 429 ? 'login.throttled' : e.code === 'mfa_required' ? 'login.mfa_needed' : e.code === 'mfa_invalid' ? 'login.mfa_failure' : 'login.failure';
    await securityEvent(kind, { ...meta, userId: target, detail: `email=${body.email}` });
    throw e;
  }
  const { user, session, secondFactor } = result;
  await securityEvent('login.success', { ...meta, userId: user.id, detail: `${body.returnToken ? 'app' : 'web'}${secondFactor ? ` +${secondFactor}` : ''}` });
  if (secondFactor === 'recovery') await securityEvent('mfa.recovery_used', { ...meta, userId: user.id });
  if (body.returnToken) return json({ user, token: session.token, expiresIn: session.maxAgeSeconds });
  return json({ user }, 200, { 'set-cookie': sessionCookie(session.token, session.maxAgeSeconds) });
}, { auth: false });
