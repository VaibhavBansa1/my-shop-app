// Printable invoice HTML for expo-print. Every value is escaped: names and narrations are
// user-entered and must never be able to inject markup or script into the print view.
import { amount, date, money, qty, VOUCHER_TYPES } from './format.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function invoiceHtml(org, v) {
  const isInvoice = v.items.length > 0;
  const inter = v.items.some((i) => i.igst);
  const title = v.type === 'sales' && org.gstin ? 'Tax Invoice' : VOUCHER_TYPES[v.type];
  const rows = isInvoice
    ? v.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td>${esc(i.hsnCode)}</td><td class="r">${esc(qty(i.qty))} ${esc(i.unit)}</td>
        <td class="r">${esc(amount(i.rate))}</td><td class="r">${esc(amount(i.taxableValue))}</td><td class="r">${esc(i.gstRate)}%</td>
        <td class="r">${esc(amount(i.igst || i.cgst + i.sgst))}</td></tr>`).join('')
    : v.entries.map((e) => `<tr><td colspan="5">${esc(e.ledgerName)}</td><td class="r">${e.debit ? esc(amount(e.debit)) : ''}</td><td class="r" colspan="2">${e.credit ? esc(amount(e.credit)) : ''}</td></tr>`).join('');
  const head = isInvoice
    ? `<tr><th>#</th><th>Item</th><th>HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">${inter ? 'IGST' : 'CGST+SGST'}</th></tr>`
    : '<tr><th colspan="5">Ledger</th><th class="r">Debit</th><th class="r" colspan="2">Credit</th></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font:13px -apple-system,Roboto,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}h2{font-size:16px;margin:0}
.top{display:flex;justify-content:space-between;gap:20px}.muted{color:#555}table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#555}.r{text-align:right}
.tot{margin-left:auto;width:260px;margin-top:10px}.tot div{display:flex;justify-content:space-between;padding:3px 0}.grand{font-weight:800;font-size:16px;border-top:1px solid #999;padding-top:6px}</style>
</head><body>
<div class="top"><div><h1>${esc(org.legalName || org.name)}</h1>${org.address ? `<div class="muted">${esc(org.address)}</div>` : ''}${org.gstin ? `<div class="muted">GSTIN ${esc(org.gstin)}</div>` : ''}</div>
<div style="text-align:right"><h2>${esc(title)}</h2><div><b>${esc(v.label)}</b></div><div class="muted">${esc(date(v.date))}</div></div></div>
${v.partyName ? `<p>Bill to: <b>${esc(v.partyName)}</b>${v.placeOfSupply ? ` · Place of supply ${esc(v.placeOfSupply)}` : ''}</p>` : ''}
${v.status === 'cancelled' ? '<p style="color:#b91c1c"><b>CANCELLED</b></p>' : ''}
<table><thead>${head}</thead><tbody>${rows}</tbody></table>
<div class="tot">${isInvoice ? `<div><span>Taxable value</span><span>${esc(money(v.taxableTotal))}</span></div>${v.taxTotal ? `<div><span>GST</span><span>${esc(money(v.taxTotal))}</span></div>` : ''}${v.roundOff ? `<div><span>Round off</span><span>${esc(money(v.roundOff))}</span></div>` : ''}` : ''}
<div class="grand"><span>Total</span><span>${esc(money(v.total))}</span></div></div>
${v.narration ? `<p class="muted">${esc(v.narration)}</p>` : ''}
</body></html>`;
}
