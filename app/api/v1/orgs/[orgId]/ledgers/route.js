import { route, readJson, json } from '../../../../../../lib/http.js';
import { ledgerSchema } from '../../../../../../lib/validation.js';
import { createLedger, listLedgers } from '../../../../../../lib/services/masters.js';
import { can } from '../../../../../../lib/permissions.js';

export const GET = route(async ({ request, db }) => {
  const sp = new URL(request.url).searchParams;
  return { ledgers: await listLedgers(db, { q: sp.get('q')?.slice(0, 100), groupCode: sp.get('group')?.slice(0, 50) }) };
}, { action: 'masters.read' });

// Accountants+ create any ledger; cashiers may create customers/suppliers only.
export const POST = route(async ({ request, db, role }) => {
  const body = ledgerSchema.parse(await readJson(request));
  return json(await createLedger(db, body, { partyOnly: !can(role, 'masters.write') }), 201);
}, { action: 'party.create' });
