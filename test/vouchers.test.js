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
