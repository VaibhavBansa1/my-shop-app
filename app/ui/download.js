'use client';
import { toCsv } from '../../shared/csv.js';

export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.replace(/[^\w.-]+/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turn a report response into spreadsheet rows. */
export function reportRows(id, d) {
  const sections = (list) => list.flatMap((s) => [[s.group, '', s.amount], ...s.ledgers.map((l) => ['', l.ledger, l.amount])]);
  switch (id) {
    case 'profit-loss': return [['Group', 'Ledger', 'Amount'], ['Opening stock', '', d.openingStock], ...sections(d.sections),
      ['Closing stock', '', d.closingStock], ['Gross profit', '', d.grossProfit], ['Net profit', '', d.netProfit]];
    case 'balance-sheet': return [['Side', 'Group', 'Ledger', 'Amount'],
      ...d.liabilities.flatMap((s) => [['Liabilities', s.group, '', s.amount], ...s.ledgers.map((l) => ['Liabilities', s.group, l.ledger, l.amount])]),
      ...d.assets.flatMap((s) => [['Assets', s.group, '', s.amount], ...s.ledgers.map((l) => ['Assets', s.group, l.ledger, l.amount])]),
      ['Total liabilities', '', '', d.totalLiabilities], ['Total assets', '', '', d.totalAssets]];
    case 'trial-balance': return [['Ledger', 'Group', 'Debit', 'Credit'], ...d.rows.map((r) => [r.ledger, r.group, r.debit, r.credit]),
      ['Total', '', d.totalDebit, d.totalCredit]];
    case 'day-book': return [['Date', 'Voucher', 'Type', 'Party', 'Amount', 'Status', 'Narration'],
      ...d.vouchers.map((v) => [v.date, v.label, v.type, v.party, v.total, v.status, v.narration])];
    case 'stock-summary': return [['Item', 'Unit', 'Quantity', 'Average cost', 'Value', 'Low stock'],
      ...d.items.map((i) => [i.name, i.unit, i.qty, i.avgCost, i.value, i.low ? 'yes' : '']), ['Total', '', '', '', d.totalValue, '']];
    case 'gst-summary': return [['Side', 'GST rate %', 'Taxable', 'CGST', 'SGST', 'IGST'],
      ...d.outward.map((r) => ['Outward', r.rate, r.taxable, r.cgst, r.sgst, r.igst]),
      ...d.inward.map((r) => ['Inward', r.rate, r.taxable, r.cgst, r.sgst, r.igst]),
      ['Output tax', '', '', '', '', d.outputTax], ['Input tax', '', '', '', '', d.inputTax], ['Net payable', '', '', '', '', d.netPayable]];
    default: if (id.startsWith('outstanding')) return [['Party', 'Amount'], ...d.parties.map((p) => [p.ledger, p.amount]), ['Total', d.total]];
  }
  return [];
}
