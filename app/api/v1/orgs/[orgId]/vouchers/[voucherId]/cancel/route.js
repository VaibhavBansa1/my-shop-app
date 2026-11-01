import { route, readJson } from '../../../../../../../../lib/http.js';
import { cancelSchema, uuid } from '../../../../../../../../lib/validation.js';
import { cancelVoucher } from '../../../../../../../../lib/services/vouchers.js';

export const POST = route(async ({ request, db, params }) => {
  const { reason } = cancelSchema.parse(await readJson(request));
  return cancelVoucher(db, uuid.parse(params.voucherId), reason);
}, { action: 'voucher.cancel' });
