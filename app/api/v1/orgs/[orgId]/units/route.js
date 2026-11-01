import { route, readJson, json } from '../../../../../../lib/http.js';
import { unitSchema } from '../../../../../../lib/validation.js';
import { createUnit, listUnits } from '../../../../../../lib/services/masters.js';

export const GET = route(async ({ db }) => ({ units: await listUnits(db) }), { action: 'masters.read' });
export const POST = route(async ({ request, db }) => json(await createUnit(db, unitSchema.parse(await readJson(request))), 201),
  { action: 'masters.write' });
