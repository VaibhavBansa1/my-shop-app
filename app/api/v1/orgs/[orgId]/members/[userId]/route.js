import { route, readJson } from '../../../../../../../lib/http.js';
import { roleChangeSchema, uuid } from '../../../../../../../lib/validation.js';
import { changeMemberRole, removeMember } from '../../../../../../../lib/services/orgs.js';
import { forbidden } from '../../../../../../../lib/errors.js';
import { can } from '../../../../../../../lib/permissions.js';

export const PATCH = route(async ({ request, db, role, params }) => {
  const { role: newRole } = roleChangeSchema.parse(await readJson(request));
  await changeMemberRole(db, role, uuid.parse(params.userId), newRole);
  return { ok: true };
}, { action: 'members.manage' });

// Members may remove themselves (leave); removing others needs members.manage.
export const DELETE = route(async ({ db, role, params, user }) => {
  const target = uuid.parse(params.userId);
  if (target !== user.id && !can(role, 'members.manage')) throw forbidden();
  await removeMember(db, role, target);
  return { ok: true };
}, { action: 'org.read' });
