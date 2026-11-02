// GST e-invoice JSON (schema 1.1): B2B only, totals match the books, problems listed instead of bad files.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

before(setupDb);
after(closePool);

test('e-invoice JSON for a B2B bill matches the voucher; B2C and missing data are explained', async () => {
  const m = await import('../lib/services/masters.js');
  const O = await import('../lib/services/orgs.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const E = await import('../lib/services/eInvoice.js');
  const { db } = await makeUserOrg({ legalName: 'Bansal Traders Pvt Ltd' });
  const groups = await m.listGroups(db); const g = (c) => groups.find((x) => x.code === c).id;
  const units = await m.listUnits(db); const pcs = units.find((u) => u.symbol === 'pcs').id;
  const b2b = await m.createLedger(db, { name: 'Delhi Mart', groupId: g('sundry_debtors'), openingBalance: 0, gstin: '07AAACR5055K1Z5', stateCode: '07',
    phone: '', email: '', address: 'Shop 4, Karol Bagh, New Delhi 110005', isActive: true });
  const rice = await m.createItem(db, { name: 'Basmati Rice 5kg', sku: '', unitId: pcs, hsnCode: '1006', gstRate: 5, salePrice: 500, purchasePrice: 400,
    reorderLevel: 0, openingQty: 50, openingRate: 400, isActive: true });
  const soap = await m.createItem(db, { name: 'Soap', sku: '', unitId: pcs, hsnCode: '', gstRate: 18, salePrice: 30, purchasePrice: 20,
    reorderLevel: 0, openingQty: 50, openingRate: 20, isActive: true });
  const base = { reference: '', narration: '', roundOff: true, entries: [], date: '2026-05-10' };

  const v = await createVoucher(db, { ...base, type: 'sales', partyLedgerId: b2b.id, items: [{ stockItemId: rice.id, qty: 3, rate: '500', discount: '50' }] });
  let r = await E.eInvoiceForVoucher(db, v.id);
  assert.ok(r.problems.some((p) => /PIN code to your business/.test(p)), 'seller PIN missing is reported');
  await O.updateOrg(db, { address: '12 Sarafa Bazaar, Gwalior 474001' });
  r = await E.eInvoiceForVoucher(db, v.id);
  assert.deepEqual(r.problems, []);
  const j = r.json;
  assert.equal(j.Version, '1.1');
  assert.deepEqual(j.TranDtls, { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' });
  assert.equal(j.DocDtls.Typ, 'INV'); assert.equal(j.DocDtls.No, 'INV/26-27/1'); assert.equal(j.DocDtls.Dt, '10/05/2026');
  assert.equal(j.SellerDtls.Gstin, '23ABCDE1234F1Z8'); assert.equal(j.SellerDtls.LglNm, 'Bansal Traders Pvt Ltd');
  assert.equal(j.SellerDtls.Pin, 474001); assert.equal(j.SellerDtls.Loc, 'Gwalior'); assert.equal(j.SellerDtls.Stcd, '23');
  assert.equal(j.BuyerDtls.Gstin, '07AAACR5055K1Z5'); assert.equal(j.BuyerDtls.Pin, 110005); assert.equal(j.BuyerDtls.Pos, '07');
  const it = j.ItemList[0];
  assert.deepEqual([it.HsnCd, it.Qty, it.Unit, it.UnitPrice, it.TotAmt, it.Discount, it.AssAmt, it.GstRt], ['1006', 3, 'NOS', 500, 1500, 50, 1450, 5]);
  assert.equal(it.IgstAmt, 72.5, 'MP to Delhi is inter-state: IGST'); assert.equal(it.CgstAmt, 0);
  assert.equal(j.ValDtls.AssVal, 1450); assert.equal(j.ValDtls.IgstVal, 72.5);
  assert.equal(j.ValDtls.TotInvVal, v.total); assert.equal(j.ValDtls.RndOffAmt, v.roundOff);
  assert.equal(r2(j.ValDtls.AssVal + j.ValDtls.IgstVal + j.ValDtls.CgstVal + j.ValDtls.SgstVal + j.ValDtls.RndOffAmt), j.ValDtls.TotInvVal);

  const cash = await createVoucher(db, { ...base, type: 'sales', items: [{ stockItemId: rice.id, qty: 1, rate: '500' }] });
  assert.equal((await E.eInvoiceForVoucher(db, cash.id)).json, null, 'B2C cash bill: no e-invoice');
  const noHsn = await createVoucher(db, { ...base, type: 'sales', partyLedgerId: b2b.id, items: [{ stockItemId: soap.id, qty: 1, rate: '30' }] });
  assert.ok((await E.eInvoiceForVoucher(db, noHsn.id)).problems.some((p) => /HSN/.test(p)));

  const period = await E.eInvoicesForPeriod(db, { from: '2026-05-01', to: '2026-05-31' });
  assert.equal(period.ready.length, 1); assert.equal(period.needsFix.length, 1);
  assert.equal(period.needsFix[0].voucherId, noHsn.id);
});
const r2 = (x) => Math.round(x * 100) / 100;
