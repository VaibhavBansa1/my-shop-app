import { route } from '../../../../../../lib/http.js';
import { sendVerification } from '../../../../../../lib/services/verification.js';

export const POST = route(async ({ request, user }) => {
  const origin = process.env.APP_ORIGIN?.split(',')[0] || new URL(request.url).origin;
  const r = await sendVerification(user.id, origin);
  return { ok: true, sent: r.sent };
});
