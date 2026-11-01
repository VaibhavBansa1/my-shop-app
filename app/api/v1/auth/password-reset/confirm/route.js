import { z } from 'zod';
import { route, readJson } from '../../../../../../lib/http.js';
import { password } from '../../../../../../lib/validation.js';
import { confirmReset } from '../../../../../../lib/services/passwordReset.js';

export const POST = route(async ({ request }) => {
  const body = z.object({ token: z.string().min(20).max(100), newPassword: password }).parse(await readJson(request));
  return confirmReset(body.token, body.newPassword);
}, { auth: false });
