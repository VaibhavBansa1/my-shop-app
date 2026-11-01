import { z } from 'zod';
import { route, readJson, clientIp, publicOrigin } from '../../../../../../lib/http.js';
import { email } from '../../../../../../lib/validation.js';
import { requestReset } from '../../../../../../lib/services/passwordReset.js';

export const POST = route(async ({ request }) => {
  const body = z.object({ email }).parse(await readJson(request));
  const origin = publicOrigin(request);
  await requestReset(body.email, { origin, ip: clientIp(request) });
  return { ok: true, message: 'If an account exists for that email, we have sent a reset link.' };
}, { auth: false });
