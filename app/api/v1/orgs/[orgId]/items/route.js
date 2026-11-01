import { route, readJson, json } from '../../../../../../lib/http.js';
import { itemSchema } from '../../../../../../lib/validation.js';
import { createItem, listItems } from '../../../../../../lib/services/masters.js';

export const GET = route(async ({ request, db }) =>
  ({ items: await listItems(db, { q: new URL(request.url).searchParams.get('q')?.slice(0, 100) }) }), { action: 'masters.read' });
export const POST = route(async ({ request, db }) => json(await createItem(db, itemSchema.parse(await readJson(request))), 201),
  { action: 'masters.write' });
