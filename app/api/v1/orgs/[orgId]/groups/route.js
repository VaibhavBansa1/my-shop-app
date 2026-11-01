import { route, readJson, json } from '../../../../../../lib/http.js';
import { groupSchema } from '../../../../../../lib/validation.js';
import { createGroup, listGroups } from '../../../../../../lib/services/masters.js';

export const GET = route(async ({ db }) => ({ groups: await listGroups(db) }), { action: 'masters.read' });
export const POST = route(async ({ request, db }) => json(await createGroup(db, groupSchema.parse(await readJson(request))), 201),
  { action: 'masters.write' });
