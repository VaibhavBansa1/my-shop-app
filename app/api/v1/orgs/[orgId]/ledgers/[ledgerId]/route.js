import { route, readJson } from '../../../../../../../lib/http.js';
import { ledgerUpdateSchema, uuid } from '../../../../../../../lib/validation.js';
import { getLedger, updateLedger } from '../../../../../../../lib/services/masters.js';

export const GET = route(async ({ db, params }) => getLedger(db, uuid.parse(params.ledgerId)), { action: 'masters.read' });
export const PATCH = route(async ({ request, db, params }) =>
  updateLedger(db, uuid.parse(params.ledgerId), ledgerUpdateSchema.parse(await readJson(request))), { action: 'masters.write' });
