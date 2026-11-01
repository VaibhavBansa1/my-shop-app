import { z } from 'zod';
import { route, readJson, clientIp } from '../../../../../../lib/http.js';
import { email } from '../../../../../../lib/validation.js';
import { requestReset } from '../../../../../../lib/services/passwordReset.js';

export const POST = route(async ({ request }) => {
  const body = z.object({ email }).parse(await readJson(request));
  const origin = process.env.APP_ORIGIN?.split(',')[0] || new URL(request.url).origin;
  await requestReset(body.email, { origin, ip: clientIp(request) });
  return { ok: true, message: 'If an account exists for that email, we have sent a reset link.' };
}, { auth: false });
