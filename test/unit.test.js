import test from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, toMilli, paiseToStr, divRound } from '../lib/money.js';
import { computeLine, computeInvoice } from '../lib/gst.js';
import { can, canManageRole } from '../lib/permissions.js';
import { fyStart, voucherNumberLabel } from '../lib/services/vouchers.js';

test('money parsing is exact and strict', () => {
  assert.equal(toPaise('123.45'), 12345);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise('-5'), -500);
  assert.equal(toMilli('1.5'), 1500);
  assert.throws(() => toPaise('1.234'));
  assert.throws(() => toPaise('abc'));
  assert.throws(() => toPaise(Number.NaN));
  assert.equal(paiseToStr(-1), '-0.01');
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(-5, 2), -3);
});

test('GST: intra-state splits CGST/SGST exactly, inter-state uses IGST', () => {
  const l = { qtyMilli: 3000, ratePaise: 3333, discountPaise: 0, gstRateBp: 1800 };
  const intra = computeLine(l, false);
  assert.equal(intra.taxable, 9999);
  assert.equal(intra.tax, 1800);
  assert.equal(intra.cgst + intra.sgst, intra.tax);
  const inter = computeLine(l, true);
  assert.equal(inter.igst, 1800);
  assert.equal(inter.cgst, 0);
  const odd = computeLine({ qtyMilli: 1000, ratePaise: 1001, gstRateBp: 500 }, false); // tax 50.05 -> 50 paise
  assert.equal(odd.cgst + odd.sgst, odd.tax);
});

test('GST invoice rounds to rupee with round-off', () => {
  const inv = computeInvoice([{ qtyMilli: 1000, ratePaise: 10050, gstRateBp: 500 }], { interState: false });
  assert.equal(inv.taxable, 10050);
  assert.equal(inv.tax, 503);
  assert.equal(inv.total, 10600);
  assert.equal(inv.roundOff, 47);
  assert.throws(() => computeLine({ qtyMilli: 1000, ratePaise: 100, discountPaise: 200 }, false));
});

test('permissions', () => {
  assert.ok(can('cashier', 'voucher.create.sales'));
  assert.ok(!can('cashier', 'voucher.create.purchase'));
  assert.ok(!can('viewer', 'party.create'));
  assert.ok(can('owner', 'org.delete'));
  assert.ok(!can('admin', 'org.delete'));
  assert.ok(canManageRole('admin', 'cashier'));
  assert.ok(!canManageRole('admin', 'admin'));
  assert.ok(!canManageRole('accountant', 'viewer'));
});

test('financial year and numbering', () => {
  assert.equal(fyStart('2026-03-31', 4), '2025-04-01');
  assert.equal(fyStart('2026-04-01', 4), '2026-04-01');
  assert.equal(fyStart('2026-06-01', 1), '2026-01-01');
  assert.equal(voucherNumberLabel('sales', '2026-04-01', 7), 'INV/26-27/7');
});

test('phone normalisation and message links', async () => {
  const { normalizePhone, whatsappUrl, invoiceMessage, paymentReminder } = await import('../shared/messages.js');
  assert.equal(normalizePhone('98765 43210'), '919876543210');
  assert.equal(normalizePhone('+91-98765-43210'), '919876543210');
  assert.equal(normalizePhone('09876543210'), '919876543210');
  assert.equal(normalizePhone('+44 20 7946 0958'), '442079460958');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(whatsappUrl('91999', 'a&b c'), 'https://wa.me/91999?text=a%26b%20c');
  assert.match(invoiceMessage({ shopName: 'S', label: 'INV/1', date: '1 Nov', total: 12, items: [{ name: 'X', qty: 1, taxableValue: 12 }] }), /Total: ₹12\.00/);
  assert.match(paymentReminder({ language: 'hinglish', shopName: 'S', customerName: 'R', amount: 5 }), /baaki ₹5\.00/);
});
