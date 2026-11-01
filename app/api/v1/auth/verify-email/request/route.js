import { route, publicOrigin } from '../../../../../../lib/http.js';
import { sendVerification } from '../../../../../../lib/services/verification.js';

export const POST = route(async ({ request, user }) => {
  const origin = publicOrigin(request);
  const r = await sendVerification(user.id, origin);
  return { ok: true, sent: r.sent };
});
