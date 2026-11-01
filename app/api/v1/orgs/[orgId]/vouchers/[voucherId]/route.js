import { route } from '../../../../../../../lib/http.js';
import { uuid } from '../../../../../../../lib/validation.js';
import { getVoucher } from '../../../../../../../lib/services/vouchers.js';

export const GET = route(async ({ db, params }) => getVoucher(db, uuid.parse(params.voucherId)), { action: 'vouchers.read' });
