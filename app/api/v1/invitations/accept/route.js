import { z } from 'zod';
import { route, readJson } from '../../../../../lib/http.js';
import { acceptInvitation, previewInvitation } from '../../../../../lib/services/orgs.js';

// The token is only ever sent in a JSON body (never in a URL), so it cannot end up in proxy/CDN access logs.
// {token, preview: true} shows what the invitation is for without accepting it.
const bodySchema = z.object({ token: z.string().min(20).max(100), preview: z.boolean().optional() });

export const POST = route(async ({ request, user }) => {
  const { token, preview } = bodySchema.parse(await readJson(request));
  return preview ? previewInvitation(user.id, token) : acceptInvitation(user.id, token);
});
