import { z } from 'zod';
import { route, readJson } from '../../../../../lib/http.js';
import { acceptInvitation, previewInvitation } from '../../../../../lib/services/orgs.js';

const tokenSchema = z.object({ token: z.string().min(20).max(100) });

export const GET = route(async ({ request, user }) => {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  return previewInvitation(user.id, tokenSchema.parse({ token }).token);
});
export const POST = route(async ({ request, user }) => {
  const { token } = tokenSchema.parse(await readJson(request));
  return acceptInvitation(user.id, token);
});
