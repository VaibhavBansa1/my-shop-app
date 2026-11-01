import { route, readJson } from '../../../../../../../lib/http.js';
import { itemUpdateSchema, uuid } from '../../../../../../../lib/validation.js';
import { updateItem } from '../../../../../../../lib/services/masters.js';

export const PATCH = route(async ({ request, db, params }) =>
  updateItem(db, uuid.parse(params.itemId), itemUpdateSchema.parse(await readJson(request))), { action: 'masters.write' });
