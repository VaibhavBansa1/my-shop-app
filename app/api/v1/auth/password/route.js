import { route, readJson } from '../../../../../lib/http.js';
import { changePasswordSchema } from '../../../../../lib/validation.js';
import { changePassword } from '../../../../../lib/services/accounts.js';

export const POST = route(async ({ request, user, tokenHash }) => {
  const body = changePasswordSchema.parse(await readJson(request));
  await changePassword(user.id, body, tokenHash);
  return { ok: true };
});
