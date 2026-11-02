// GST e-invoice JSON for the Invoice Registration Portal (schema 1.1).
//   ?voucherId=<id>            -> { voucher, json, problems }   (one bill)
//   ?from=YYYY-MM-DD&to=...    -> { ready: [json...], needsFix: [{voucher, problems}] } (bulk upload file)
//   &download=1                -> the JSON array as a file (only ready documents)
import { route, json } from '../../../../../../lib/http.js';
import { uuid, isoDate } from '../../../../../../lib/validation.js';
import { eInvoiceForVoucher, eInvoicesForPeriod } from '../../../../../../lib/services/eInvoice.js';
import { securityEvent } from '../../../../../../lib/services/securityLog.js';

export const GET = route(async ({ request, db, user }) => {
  const q = new URL(request.url).searchParams;
  if (q.get('voucherId')) {
    const r = await eInvoiceForVoucher(db, uuid.parse(q.get('voucherId')));
    if (q.get('download') === '1' && r.json && !r.problems.length) {
      return json([r.json], 200, { 'content-disposition': `attachment; filename="e-invoice-${r.voucher.replace(/[^\w-]+/g, '-')}.json"` });
    }
    return r;
  }
  const r = await eInvoicesForPeriod(db, { from: isoDate.parse(q.get('from')), to: isoDate.parse(q.get('to')) });
  await securityEvent('export.e_invoice', { userId: user.id, orgId: db.orgId, detail: `${r.from}..${r.to} ready=${r.ready.length}` });
  if (q.get('download') === '1') return json(r.ready, 200, { 'content-disposition': `attachment; filename="e-invoices-${r.from}-to-${r.to}.json"` });
  return r;
}, { action: 'voucher.create.purchase' });   // accountants and above (contains customers' addresses)
