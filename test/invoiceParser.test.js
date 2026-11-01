import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceText, parseAmount, parseDate } from '../shared/invoiceParser.js';
import { isValidGstin, repairGstin, gstinCheckChar } from '../shared/gstin.js';

const OWN = '23ABCDE1234F1Z8';
const SUPPLIER = '27AAACR5055K1Z7';

test('GSTIN checksum and OCR repair', () => {
  assert.ok(isValidGstin(OWN));
  assert.ok(!isValidGstin('23ABCDE1234F1Z5'), 'wrong check digit');
  assert.ok(!isValidGstin('nonsense'));
  assert.equal(repairGstin('27AAACRSOSSK1Z7'), SUPPLIER, 'S->5 and O->0 in digit positions');
  assert.equal(repairGstin('2 7AAACR5055K1Z7'), SUPPLIER);
  assert.equal(repairGstin('27AAACR5055K1Z1'), null, 'invalid checksum is rejected, not guessed');
  assert.equal(gstinCheckChar('07AAGCS1234M1Z'), '9');
});

test('amount and date parsing', () => {
  assert.equal(parseAmount('1,23,456.78'), 123456.78);
  assert.equal(parseAmount('₹ 450.00'), 450);
  assert.equal(parseAmount('450/-'), 450);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseDate('Date: 05/11/2026'), '2026-11-05');
  assert.equal(parseDate('Dated 5-Nov-26'), '2026-11-05');
  assert.equal(parseDate('12 September 2026'), '2026-09-12');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('2026-04-01'), '2026-04-01');
});

const intraInvoice = `
ANNAPURNA WHOLESALE TRADERS
Shop 12, Grain Market, Indore
GSTIN: 27AAACR5O55K1Z7
TAX INVOICE
Invoice No: AW/2026/0457        Date: 03/11/2026
Bill To: Bansal General Store  GSTIN ${OWN}
Sr Description          HSN    Qty   Rate     GST   Amount
1  Basmati Rice 5kg     1006   10    420.00   5%    4,200.00
2  Mustard Oil 1L       1514   24    145.00   5%    3,480.00
3  Sugar 1kg            1701   50    42.50    5%    2,125.00
Taxable Value                                       9,805.00
CGST @ 2.5%                                         245.13
SGST @ 2.5%                                         245.12
Round Off                                           -0.25
Grand Total                                         10,295.00
Amount in words: Ten Thousand Two Hundred Ninety Five Only
Bank: HDFC  IFSC HDFC0000123
`;

test('parses a typical intra-state GST invoice (with OCR noise in the GSTIN)', () => {
  const r = parseInvoiceText(intraInvoice, { ownGstin: OWN });
  assert.equal(r.supplierGstin, SUPPLIER);
  assert.deepEqual(r.gstins.sort(), [OWN, SUPPLIER].sort());
  assert.equal(r.supplierName, 'ANNAPURNA WHOLESALE TRADERS');
  assert.equal(r.invoiceNumber, 'AW/2026/0457');
  assert.equal(r.invoiceDate, '2026-11-03');
  assert.equal(r.totals.taxable, 9805);
  assert.equal(r.totals.cgst, 245.13);
  assert.equal(r.totals.sgst, 245.12);
  assert.equal(r.totals.total, 10295);
  assert.equal(r.interState, false);
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[0], { description: 'Basmati Rice 5kg', hsn: '1006', qty: 10, rate: 420, amount: 4200, discount: 0, gstRate: 5 });
  assert.equal(r.items[2].rate, 42.5);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.confidence, 1);
});

test('inter-state invoice with IGST and a mismatch warning', () => {
  const text = `Supplier GSTIN 07AAGCS1234M1Z9\nInv No. 88\nDt 01-Oct-2026\nLED Bulb 9W 8539 100 55 5500\nIGST 18% 990.00\nTotal 6600.00`;
  const r = parseInvoiceText(text, { ownGstin: OWN });
  assert.equal(r.supplierGstin, '07AAGCS1234M1Z9');
  assert.equal(r.invoiceNumber, '88');
  assert.equal(r.invoiceDate, '2026-10-01');
  assert.equal(r.interState, true);
  assert.equal(r.totals.igst, 990);
  assert.equal(r.items[0].hsn, '8539');
  assert.ok(r.warnings.some((w) => /total/i.test(w)), 'taxable + tax (6490) != total (6600) must be flagged');
  assert.ok(r.warnings.some((w) => /Your GSTIN/.test(w)));
});

test('OCR noise before item names is dropped', () => {
  const r = parseInvoiceText('§ Basmati Rice 5kg 1006 10 420.00 4200.00');
  assert.equal(r.items[0].description, 'Basmati Rice 5kg');
});

test('garbage, empty and hostile input never throws', () => {
  for (const t of ['', null, undefined, '%%%%', 'x'.repeat(200000), '<script>alert(1)</script> 1 2 3', '9'.repeat(5000)]) {
    const r = parseInvoiceText(t);
    assert.ok(Array.isArray(r.items));
    assert.ok(r.confidence >= 0 && r.confidence <= 1);
  }
  const long = Array.from({ length: 3000 }, (_, i) => `Item ${i} 1006 1 10 10`).join('\n');
  const t0 = Date.now();
  const r = parseInvoiceText(long);
  assert.ok(r.items.length <= 100);
  assert.ok(Date.now() - t0 < 2000, 'parser stays fast on large input');
});
