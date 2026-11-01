import { route, readJson, json } from '../../../../../../lib/http.js';
import { voucherSchema, dateRange, uuid } from '../../../../../../lib/validation.js';
import { createVoucher, listVouchers } from '../../../../../../lib/services/vouchers.js';
import { forbidden } from '../../../../../../lib/errors.js';
import { can } from '../../../../../../lib/permissions.js';
import { z } from 'zod';

const listQuery = dateRange.extend({
  type: voucherSchema.shape.type.optional(),
  party: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const GET = route(async ({ request, db }) => {
  const q = listQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { vouchers: await listVouchers(db, { ...q, partyLedgerId: q.party }) };
}, { action: 'vouchers.read' });

export const POST = route(async ({ request, db, role }) => {
  const body = voucherSchema.parse(await readJson(request));
  if (!can(role, `voucher.create.${body.type}`)) throw forbidden(`Your role cannot create ${body.type.replace('_', ' ')} vouchers.`);
  if (body.replacesVoucherId && !can(role, 'voucher.cancel')) throw forbidden('Your role cannot correct (cancel) vouchers.');
  return json(await createVoucher(db, body), 201);
}, { action: 'vouchers.read' });
