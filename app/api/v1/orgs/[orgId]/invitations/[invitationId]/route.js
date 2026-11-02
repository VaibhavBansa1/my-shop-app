import { route } from '../../../../../../../lib/http.js';
import { uuid } from '../../../../../../../lib/validation.js';
import { revokeInvitation } from '../../../../../../../lib/services/orgs.js';

export const DELETE = route(async ({ db, params, role }) => {
  await revokeInvitation(db, uuid.parse(params.invitationId), role);
  return { ok: true };
}, { action: 'members.manage' });
