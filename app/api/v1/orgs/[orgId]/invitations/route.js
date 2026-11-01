import { route, readJson, json, publicOrigin } from '../../../../../../lib/http.js';
import { inviteSchema } from '../../../../../../lib/validation.js';
import { inviteMember } from '../../../../../../lib/services/orgs.js';

// The token is returned exactly once; the inviter shares the link (WhatsApp/email).
export const POST = route(async ({ request, db, role }) => {
  const body = inviteSchema.parse(await readJson(request));
  const origin = publicOrigin(request);
  const inv = await inviteMember(db, role, body, { origin });
  return json({ id: inv.id, token: inv.token, expiresAt: inv.expiresAt, emailed: Boolean(inv.emailed), link: `${origin}/invite#${inv.token}` }, 201);
}, { action: 'members.manage' });
