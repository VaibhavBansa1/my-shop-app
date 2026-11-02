import { z } from 'zod';
import { route, readJson } from '../../../../../lib/http.js';
import { orgUpdateSchema } from '../../../../../lib/validation.js';
import { deleteOrg, getOrg, updateOrg } from '../../../../../lib/services/orgs.js';
import { allowedActions } from '../../../../../lib/permissions.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';

export const GET = route(async ({ db, role }) => ({ ...(await getOrg(db)), permissions: allowedActions(role) }), { action: 'org.read' });
export const PATCH = route(async ({ request, db }) => updateOrg(db, orgUpdateSchema.parse(await readJson(request))), { action: 'org.update' });
export const DELETE = route(async ({ request, db }) => {
  const { confirmName } = z.object({ confirmName: z.string().max(200) }).parse(await readJson(request));
  await deleteOrg(db, confirmName);
  await securityEvent('org.deleted', { userId: db.userId, orgId: db.orgId, detail: confirmName });
  return { ok: true };
}, { action: 'org.delete' });
