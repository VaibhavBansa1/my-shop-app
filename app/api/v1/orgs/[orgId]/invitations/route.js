import { route, readJson, json } from '../../../../../../lib/http.js';
import { inviteSchema } from '../../../../../../lib/validation.js';
import { inviteMember } from '../../../../../../lib/services/orgs.js';

// The token is returned exactly once; the inviter shares the link (WhatsApp/email).
export const POST = route(async ({ request, db, role }) => {
  const body = inviteSchema.parse(await readJson(request));
  const inv = await inviteMember(db, role, body);
  const origin = process.env.APP_ORIGIN?.split(',')[0] || new URL(request.url).origin;
  return json({ ...inv, link: `${origin}/invite#${inv.token}` }, 201);
}, { action: 'members.manage' });
