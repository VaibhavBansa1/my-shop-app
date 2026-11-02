import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

before(setupDb);
after(closePool);

async function fixtures(db) {
  const m = await import('../lib/services/masters.js');
  const groups = await m.listGroups(db);
  const g = (code) => groups.find((x) => x.code === code).id;
  const units = await m.listUnits(db);
  const pcs = units.find((u) => u.symbol === 'pcs').id;
  const kg = units.find((u) => u.symbol === 'kg').id;
  const customer = await m.createLedger(db, { name: 'Ramesh Traders', groupId: g('sundry_debtors'), openingBalance: 0,
    stateCode: '23', phone: '', email: '', address: '', isActive: true });
  const delhiCustomer = await m.createLedger(db, { name: 'Delhi Mart', groupId: g('sundry_debtors'), openingBalance: 0,
    stateCode: '07', phone: '', email: '', address: '', isActive: true });
  const supplier = await m.createLedger(db, { name: 'Annapurna Wholesale', groupId: g('sundry_creditors'), openingBalance: 0,
    stateCode: '23', phone: '', email: '', address: '', isActive: true });
  const bank = await m.createLedger(db, { name: 'HDFC Bank', groupId: g('bank_accounts'), openingBalance: '50000',
    phone: '', email: '', address: '', isActive: true });
  const capital = (await m.listLedgers(db)).find((l) => l.code === 'capital');
  await m.updateLedger(db, capital.id, { openingBalance: '-54000' }); // bank 50,000 + opening stock 4,000
  const rice = await m.createItem(db, { name: 'Basmati Rice 5kg', sku: 'RICE5', unitId: pcs, hsnCode: '1006', gstRate: 5,
    salePrice: 510, purchasePrice: 420, reorderLevel: 5, openingQty: 10, openingRate: 400, isActive: true });
  const sugar = await m.createItem(db, { name: 'Sugar', sku: '', unitId: kg, hsnCode: '1701', gstRate: 5,
    salePrice: 48, purchasePrice: 42, reorderLevel: 0, openingQty: 0, openingRate: 0, isActive: true });
  const ledgers = await m.listLedgers(db);
  const code = (c) => ledgers.find((l) => l.code === c).id;
  return { customer, delhiCustomer, supplier, bank, rice, sugar, code, g };
}

const base = { reference: '', narration: '', roundOff: true, items: [], entries: [] };

test('sales voucher: GST split, balanced entries, stock moves, numbering', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { listItems } = await import('../lib/services/masters.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const v = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-10', partyLedgerId: f.customer.id,
    items: [{ stockItemId: f.rice.id, qty: 2, rate: '510', discount: 0 }] });
  assert.equal(v.label, 'INV/26-27/1');
  assert.equal(v.taxableTotal, 1020);
  assert.equal(v.taxTotal, 51);
  assert.equal(v.total, 1071);
  const dr = v.entries.reduce((a, e) => a + e.debit, 0);
  const cr = v.entries.reduce((a, e) => a + e.credit, 0);
  assert.equal(Math.round(dr * 100), Math.round(cr * 100));
  assert.deepEqual(v.entries.map((e) => e.ledgerName).sort(), ['Output CGST', 'Output SGST', 'Ramesh Traders', 'Sales'].sort());
  const items = await listItems(db);
  assert.equal(items.find((i) => i.id === f.rice.id).stockQty, 8);

  const v2 = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-11', partyLedgerId: f.delhiCustomer.id,
    items: [{ stockItemId: f.rice.id, qty: 1, rate: '510' }] });
  assert.equal(v2.label, 'INV/26-27/2');
  assert.ok(v2.entries.some((e) => e.ledgerName === 'Output IGST'));
  assert.ok(!v2.entries.some((e) => e.ledgerName === 'Output CGST'));
});

test('quantity decimals follow the unit; cash sale defaults to Cash ledger', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  await assert.rejects(createVoucher(db, { ...base, type: 'sales', date: '2026-05-10',
    items: [{ stockItemId: f.rice.id, qty: '1.5', rate: 510 }] }), /decimal/);
  const v = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-10',
    items: [{ stockItemId: f.sugar.id, qty: '1.25', rate: 48 }] });
  assert.equal(v.partyName, 'Cash');
  assert.equal(v.taxableTotal, 60);
});

test('receipt/payment/contra/journal rules and balancing', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const cash = f.code('cash');
  const r = await createVoucher(db, { ...base, type: 'receipt', date: '2026-05-12',
    entries: [{ ledgerId: cash, debit: 500 }, { ledgerId: f.customer.id, credit: 500 }] });
  assert.equal(r.partyLedgerId, f.customer.id);
  await assert.rejects(createVoucher(db, { ...base, type: 'receipt', date: '2026-05-12',
    entries: [{ ledgerId: f.customer.id, debit: 5 }, { ledgerId: f.supplier.id, credit: 5 }] }), /cash or bank/);
  await assert.rejects(createVoucher(db, { ...base, type: 'journal', date: '2026-05-12',
    entries: [{ ledgerId: cash, debit: 5 }, { ledgerId: f.customer.id, credit: 4 }] }), /equal/);
  await assert.rejects(createVoucher(db, { ...base, type: 'contra', date: '2026-05-12',
    entries: [{ ledgerId: cash, debit: 5 }, { ledgerId: f.customer.id, credit: 5 }] }), /Contra/);
  const c = await createVoucher(db, { ...base, type: 'contra', date: '2026-05-12',
    entries: [{ ledgerId: cash, debit: 100 }, { ledgerId: f.bank.id, credit: 100 }] });
  assert.equal(c.label, 'CON/26-27/1');
  await assert.rejects(createVoucher(db, { ...base, type: 'sales', date: '2026-03-01',
    items: [{ stockItemId: f.rice.id, qty: 1, rate: 1 }] }), /books start/);
});

test('database rejects unbalanced or edited vouchers', async () => {
  const { withOrg } = await import('../lib/db.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  await assert.rejects(withOrg(db, async (c) => {
    const { rows } = await c.query(`insert into vouchers (org_id, type, fy_start, number, date, created_by)
      values ($1, 'journal', '2026-04-01', 999, '2026-05-01', $2) returning id`, [db.orgId, db.userId]);
    await c.query(`insert into voucher_entries (org_id, voucher_id, line_no, ledger_id, amount) values
      ($1, $2, 1, $3, 10), ($1, $2, 2, $4, -9)`, [db.orgId, rows[0].id, f.code('cash'), f.customer.id]);
  }), /not balanced/);
  const v = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-10', items: [{ stockItemId: f.rice.id, qty: 1, rate: 100 }] });
  await assert.rejects(withOrg(db, (c) => c.query('update vouchers set total = 1 where id = $1', [v.id])), /permission denied/);
  await assert.rejects(withOrg(db, (c) => c.query('update voucher_entries set amount = 1 where voucher_id = $1', [v.id])), /permission denied/);
  await assert.rejects(withOrg(db, (c) => c.query("update vouchers set status = 'cancelled', cancel_reason = 'x' where id = $1 returning *", [v.id])
    .then(() => c.query("update vouchers set status = 'posted' where id = $1", [v.id]))), /cannot be changed/);
});

test('reports: trial balance ties, P&L and balance sheet balance, cancel excludes', async () => {
  const { createVoucher, cancelVoucher } = await import('../lib/services/vouchers.js');
  const R = await import('../lib/services/reports.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const cash = f.code('cash');
  await createVoucher(db, { ...base, type: 'purchase', date: '2026-05-01', partyLedgerId: f.supplier.id,
    items: [{ stockItemId: f.rice.id, qty: 10, rate: 420 }, { stockItemId: f.sugar.id, qty: 50, rate: 42 }] });
  const sale = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-05', partyLedgerId: f.customer.id,
    items: [{ stockItemId: f.rice.id, qty: 4, rate: 510 }, { stockItemId: f.sugar.id, qty: '12.5', rate: 48 }] });
  await createVoucher(db, { ...base, type: 'receipt', date: '2026-05-06',
    entries: [{ ledgerId: cash, debit: 1000 }, { ledgerId: f.customer.id, credit: 1000 }] });
  await createVoucher(db, { ...base, type: 'payment', date: '2026-05-07',
    entries: [{ ledgerId: f.code('rent'), debit: 300 }, { ledgerId: cash, credit: 300 }] });
  const bad = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-08',
    items: [{ stockItemId: f.rice.id, qty: 1, rate: 99999 }] });
  await cancelVoucher(db, bad.id, 'entered by mistake');

  const tb = await R.trialBalance(db, { to: '2026-05-31' });
  assert.equal(tb.totalDebit, tb.totalCredit, 'trial balance should tie (opening balances were balanced)');

  const pl = await R.profitLoss(db, { from: '2026-04-01', to: '2026-05-31' });
  assert.equal(pl.openingStock, 4000);
  // sales taxable 4*510 + 12.5*48 = 2640
  assert.equal(pl.directIncome, 2640);
  const bs = await R.balanceSheet(db, { to: '2026-05-31' });
  assert.equal(bs.totalAssets, bs.totalLiabilities, 'balance sheet must balance');
  assert.ok(!bs.liabilities.some((s) => s.group.startsWith('Difference')));

  const stock = await R.stockSummary(db, { to: '2026-05-31' });
  assert.equal(stock.items.find((i) => i.name === 'Basmati Rice 5kg').qty, 16);
  const gst = await R.gstSummary(db, { from: '2026-04-01', to: '2026-05-31' });
  assert.equal(gst.outwardTotal.taxable, 2640);
  assert.equal(gst.netPayable, Math.round((gst.outputTax - gst.inputTax) * 100) / 100);
  const out = await R.outstanding(db, { kind: 'receivable', to: '2026-05-31' });
  assert.equal(out.parties[0].amount, sale.total - 1000);
  const st = await R.ledgerStatement(db, f.customer.id, { from: '2026-04-01', to: '2026-05-31' });
  assert.equal(st.closing, sale.total - 1000);
  const dash = await R.dashboard(db);
  assert.ok(typeof dash.cashAndBank === 'number');
});

test('balance sheet shows difference when opening balances do not tie', async () => {
  const R = await import('../lib/services/reports.js');
  const m = await import('../lib/services/masters.js');
  const { db } = await makeUserOrg();
  const groups = await m.listGroups(db);
  await m.createLedger(db, { name: 'Old Bank', groupId: groups.find((g) => g.code === 'bank_accounts').id,
    openingBalance: 1000, phone: '', email: '', address: '', isActive: true });
  const bs = await R.balanceSheet(db, { to: '2026-05-31' });
  assert.equal(bs.totalAssets, bs.totalLiabilities);
  assert.equal(bs.liabilities.find((s) => s.group.startsWith('Difference')).amount, 1000);
});

test('correcting a voucher posts the new one and cancels the original atomically', async () => {
  const { createVoucher, getVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const orig = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-10', items: [{ stockItemId: f.rice.id, qty: 5, rate: 510 }] });
  const fixed = await createVoucher(db, { ...base, type: 'sales', date: '2026-05-10', replacesVoucherId: orig.id,
    items: [{ stockItemId: f.rice.id, qty: 3, rate: 510 }] });
  const old = await getVoucher(db, orig.id);
  assert.equal(old.status, 'cancelled');
  assert.equal(old.cancelReason, `Corrected: replaced by ${fixed.label}`);
  // Cannot correct twice, cannot change type, and a failed correction leaves the original untouched.
  await assert.rejects(createVoucher(db, { ...base, type: 'sales', date: '2026-05-10', replacesVoucherId: orig.id,
    items: [{ stockItemId: f.rice.id, qty: 1, rate: 1 }] }), /already cancelled/);
  const before = (await import('../lib/services/reports.js')).dayBook;
  await assert.rejects(createVoucher(db, { ...base, type: 'purchase', date: '2026-05-10', replacesVoucherId: fixed.id,
    items: [{ stockItemId: f.rice.id, qty: 1, rate: 1 }] }), /same voucher type/);
  assert.equal((await getVoucher(db, fixed.id)).status, 'posted', 'failed correction rolled back');
  const book = await before(db, { from: '2026-05-10', to: '2026-05-10' });
  assert.equal(book.vouchers.filter((v) => v.type === 'purchase').length, 0, 'no stray purchase from the failed correction');
});

test('numbering stays gap-free and unique under concurrent saves', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const made = await Promise.all(Array.from({ length: 20 }, () => createVoucher(db, { ...base, type: 'sales', date: '2026-06-01',
    items: [{ stockItemId: f.sugar.id, qty: 1, rate: 48 }] })));
  const nums = made.map((v) => v.number).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 20 }, (_, i) => i + 1));
});

test('books start date cannot move past existing vouchers', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { updateOrg } = await import('../lib/services/orgs.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  await createVoucher(db, { ...base, type: 'sales', date: '2026-05-01', items: [{ stockItemId: f.sugar.id, qty: 1, rate: 48 }] });
  await assert.rejects(updateOrg(db, { booksFrom: '2026-06-01' }), /cannot start after/);
  const o = await updateOrg(db, { booksFrom: '2026-04-15' });
  assert.equal(o.booksFrom, '2026-04-15');
});

test('field rules: duplicate supplier bill, far-future dates, opening rate default, GSTIN/state', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const m = await import('../lib/services/masters.js');
  const { updateOrg } = await import('../lib/services/orgs.js');
  const { ledgerCreateChecked, orgCreateChecked } = await import('../lib/validation.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const bill = { ...base, type: 'purchase', date: '2026-05-02', partyLedgerId: f.supplier.id, reference: 'AW/0457', items: [{ stockItemId: f.rice.id, qty: 1, rate: 400 }] };
  const first = await createVoucher(db, bill);
  await assert.rejects(createVoucher(db, { ...bill, reference: ' aw/0457 ' }), /already entered as PUR\/26-27\/1/);
  // A correction of that same bill is allowed (it replaces the original).
  await createVoucher(db, { ...bill, replacesVoucherId: first.id, items: [{ stockItemId: f.rice.id, qty: 2, rate: 400 }] });
  // Same number from a different supplier is fine.
  const other = await m.createLedger(db, { name: 'Other Supplier', groupId: f.g('sundry_creditors'), stateCode: '23' });
  await createVoucher(db, { ...bill, partyLedgerId: other.id });
  const far = new Date(); far.setDate(far.getDate() + 60);
  await assert.rejects(createVoucher(db, { ...base, type: 'sales', date: far.toISOString().slice(0, 10), items: [{ stockItemId: f.rice.id, qty: 1, rate: 1 }] }), /future/);
  const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
  const it = await m.createItem(db, { name: 'Soap', unitId: pcs, purchasePrice: 30, openingQty: 10 });
  assert.equal(it.openingRate, 30, 'opening stock valued at purchase price when no rate given');
  assert.throws(() => ledgerCreateChecked.parse({ name: 'X', groupId: f.g('sundry_debtors'), gstin: '27AAACR5055K1Z7', stateCode: '23' }), /does not match/);
  assert.throws(() => orgCreateChecked.parse({ name: 'X', gstin: '23ABCDE1234F1Z8', stateCode: '27' }), /does not match/);
  await assert.rejects(updateOrg(db, { stateCode: '27' }), /does not match/);
  await assert.rejects(m.updateLedger(db, f.supplier.id, { gstin: '27AAACR5055K1Z7' }), /does not match/);
});

test('stock adjustments: quantity moves, profit reflects the loss, GST untouched, cancel restores', async () => {
  const { createVoucher, cancelVoucher } = await import('../lib/services/vouchers.js');
  const R = await import('../lib/services/reports.js');
  const { withOrg } = await import('../lib/db.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db); // rice: opening 10 @ 400
  const plBefore = await R.profitLoss(db, { from: '2026-04-01', to: '2026-05-31' });
  await assert.rejects(createVoucher(db, { ...base, type: 'stock_adjustment', date: '2026-05-03', items: [{ stockItemId: f.rice.id, qty: 2, direction: 'out' }] }), /reason/);
  await assert.rejects(createVoucher(db, { ...base, type: 'stock_adjustment', date: '2026-05-03', narration: 'x', items: [{ stockItemId: f.rice.id, qty: 2 }] }), /in or out/);
  const adj = await createVoucher(db, { ...base, type: 'stock_adjustment', date: '2026-05-03', narration: 'Damaged in rain',
    items: [{ stockItemId: f.rice.id, qty: 2, direction: 'out' }, { stockItemId: f.sugar.id, qty: '1.5', direction: 'in', rate: 40 }] });
  assert.equal(adj.label, 'ADJ/26-27/1');
  assert.equal(adj.total, 0);
  assert.equal(adj.entries.length, 0);
  const stock = await R.stockSummary(db, { to: '2026-05-31' });
  assert.equal(stock.items.find((i) => i.name === 'Basmati Rice 5kg').qty, 8);
  assert.equal(stock.items.find((i) => i.name === 'Sugar').qty, 1.5);
  const pl = await R.profitLoss(db, { from: '2026-04-01', to: '2026-05-31' });
  assert.equal(Math.round((plBefore.closingStock - pl.closingStock) * 100) / 100, 800 - 1.5 * 42, 'closing stock falls by the damaged rice at cost, rises by found sugar');
  assert.equal(pl.grossProfit, Math.round((plBefore.grossProfit - 800 + 63) * 100) / 100);
  const bs = await R.balanceSheet(db, { to: '2026-05-31' });
  assert.equal(bs.totalAssets, bs.totalLiabilities, 'balance sheet still balances');
  const gst = await R.gstSummary(db, { from: '2026-04-01', to: '2026-05-31' });
  assert.equal(gst.inward.length + gst.outward.length, 0, 'adjustments are not GST supplies');
  await cancelVoucher(db, adj.id, 'entered by mistake');
  assert.equal((await R.stockSummary(db, { to: '2026-05-31' })).items.find((i) => i.name === 'Basmati Rice 5kg').qty, 10);
  // The database refuses an adjustment with ledger entries.
  await assert.rejects(withOrg(db, async (c) => {
    const { rows } = await c.query(`insert into vouchers (org_id, type, fy_start, number, date, created_by) values ($1, 'stock_adjustment', '2026-04-01', 99, '2026-05-01', $2) returning id`, [db.orgId, db.userId]);
    await c.query(`insert into voucher_items (org_id, voucher_id, line_no, stock_item_id, qty, rate, taxable_value, stock_qty) values ($1, $2, 1, $3, 1, 1, 0, -1)`, [db.orgId, rows[0].id, f.rice.id]);
    await c.query(`insert into voucher_entries (org_id, voucher_id, line_no, ledger_id, amount) values ($1, $2, 1, $3, 5), ($1, $2, 2, $4, -5)`, [db.orgId, rows[0].id, f.code('cash'), f.code('sales')]);
  }), /no ledger entries/);
});

test('idempotency: same key returns the first bill; parallel duplicates create one; different body refused', async () => {
  const { idempotent } = await import('../lib/idempotency.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { db } = await makeUserOrg();
  const f = await fixtures(db);
  const body = { ...base, type: 'sales', date: '2026-05-10', items: [{ stockItemId: f.rice.id, qty: 1, rate: 100 }] };
  const req = (key) => new Request('http://x/', { headers: { 'idempotency-key': key } });
  const runs = await Promise.allSettled([1, 2, 3].map(() => idempotent(req('double-tap-1'), db, body, (bc) => createVoucher(db, body, { beforeCommit: bc }))));
  const ok = runs.filter((r) => r.status === 'fulfilled');
  assert.ok(ok.length >= 1);
  assert.ok(runs.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 409), 'in-flight duplicates get 409');
  const again = await idempotent(req('double-tap-1'), db, body, (bc) => createVoucher(db, body, { beforeCommit: bc }));
  assert.equal(again.replayed, true);
  assert.equal(again.data.id, ok[0].value.data.id, 'replay returns the same bill');
  const R = await import('../lib/services/reports.js');
  assert.equal((await R.dayBook(db, { from: '2026-05-10', to: '2026-05-10' })).vouchers.length, 1, 'exactly one bill');
  await assert.rejects(idempotent(req('double-tap-1'), db, { ...body, narration: 'changed' }, () => createVoucher(db, body)), /different request/);
  await assert.rejects(idempotent(req('bad key!'), db, body, () => createVoucher(db, body)), /Idempotency-Key/);
  // A failed request frees its key for a corrected retry.
  const bad = { ...body, items: [{ stockItemId: f.rice.id, qty: 0, rate: 1 }] };
  await assert.rejects(idempotent(req('retry-key-1'), db, bad, () => createVoucher(db, bad)));
  const fixed = await idempotent(req('retry-key-1'), db, bad, () => createVoucher(db, body));
  assert.equal(fixed.replayed, false);
});

test('validation hardening: impossible dates and NUL characters are refused', async () => {
  const { voucherSchema } = await import('../lib/validation.js');
  const { parseJsonStrict } = await import('../lib/http.js');
  assert.throws(() => voucherSchema.parse({ type: 'sales', date: '2026-02-30' }), /does not exist/);
  assert.throws(() => voucherSchema.parse({ type: 'sales', date: '1800-01-01' }), /does not exist/);
  assert.equal(voucherSchema.parse({ type: 'sales', date: '2028-02-29' }).date, '2028-02-29', 'leap day is fine');
  assert.throws(() => parseJsonStrict('{"narration":"a\\u0000b"}'), /NUL/);
  assert.deepEqual(parseJsonStrict('{"narration":"a\\\\u0000b"}'), { narration: 'a\\u0000b' }, 'a literal backslash-u text is fine');
});
