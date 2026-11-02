// GST e-invoice JSON (government schema version 1.1, as uploaded to the Invoice Registration Portal).
// We PREPARE the file; getting the IRN and signed QR code needs the business's own IRP/GSP login, so the
// shop (or its accountant) uploads this JSON on the portal, or a GSP integration can send it later.
// Only B2B documents qualify: the seller and the buyer both have a GSTIN. Sales -> INV, Credit Note -> CRN.
import { withOrg } from '../db.js';
import { decryptField as dec } from '../crypto.js';
import { getVoucher } from './vouchers.js';
import { badRequest } from '../errors.js';

// Unit Quantity Codes the portal accepts for our built-in units; anything else is OTH (others).
const UQC = { pcs: 'NOS', nos: 'NOS', kg: 'KGS', g: 'GMS', gm: 'GMS', l: 'LTR', ltr: 'LTR', ml: 'MLT', m: 'MTR', box: 'BOX', pkt: 'PAC',
  pack: 'PAC', dozen: 'DOZ', doz: 'DOZ', bag: 'BAG', btl: 'BTL', bottle: 'BTL', set: 'SET', pair: 'PRS', roll: 'ROL', tonne: 'TON', qtl: 'QTL' };
const r2 = (x) => Math.round(Number(x) * 100) / 100;
const ddmmyyyy = (d) => { const s = String(d instanceof Date ? d.toISOString() : d).slice(0, 10); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };
const pinOf = (addr) => (String(addr || '').match(/\b([1-9][0-9]{5})\b/) || [])[1] ?? null;
/** Short, single-line text as the schema wants (no line breaks; length limits). */
const line = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const locOf = (addr) => {
  const parts = String(addr || '').split(/[,\n]/).map((p) => p.replace(/\b[1-9][0-9]{5}\b/, '').trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
};

/**
 * Pure builder. Returns { json, problems }: problems are the reasons the portal would refuse the file
 * (shown to the user to fix, e.g. a missing HSN code or PIN code). json is null when not a B2B document.
 */
export function buildEInvoice(org, party, v) {
  const problems = [];
  const typ = v.type === 'sales' ? 'INV' : v.type === 'credit_note' ? 'CRN' : null;
  if (!typ) return { json: null, problems: ['Only sales bills and credit notes are e-invoices.'] };
  if (v.status !== 'posted') problems.push('This bill is cancelled; cancelled bills are not reported.');
  if (!org.gstin) problems.push('Your business has no GSTIN (Settings).');
  if (!party?.gstin) return { json: null, problems: ['The customer has no GSTIN, so this is a B2C bill: no e-invoice is needed.'] };
  const sellerPin = pinOf(org.address); const buyerPin = pinOf(party.address);
  if (!sellerPin) problems.push('Add a 6-digit PIN code to your business address (Settings).');
  if (!buyerPin) problems.push(`Add a 6-digit PIN code to ${party.name}'s address.`);
  const items = v.items.map((i, k) => {
    if (!/^[0-9]{4,8}$/.test(i.hsnCode || '')) problems.push(`Line ${k + 1} (${i.name}): add an HSN code (4–8 digits) to the item.`);
    const tot = r2(i.qty * i.rate);
    return {
      SlNo: String(k + 1), PrdDesc: line(i.description || i.name, 300), IsServc: 'N', HsnCd: i.hsnCode || '',
      Qty: Number(i.qty), Unit: UQC[String(i.unit).toLowerCase()] ?? 'OTH', UnitPrice: r2(i.rate), TotAmt: tot, Discount: r2(i.discount),
      AssAmt: r2(i.taxableValue), GstRt: Number(i.gstRate), IgstAmt: r2(i.igst), CgstAmt: r2(i.cgst), SgstAmt: r2(i.sgst),
      TotItemVal: r2(i.taxableValue + i.igst + i.cgst + i.sgst),
    };
  });
  const sum = (k) => r2(items.reduce((a, i) => a + i[k], 0));
  const json = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: typ, No: line(v.label, 16), Dt: ddmmyyyy(v.date) },
    SellerDtls: { Gstin: org.gstin, LglNm: line(org.legalName || org.name, 100), TrdNm: line(org.name, 100),
      Addr1: line(org.address || '', 100) || '-', Loc: line(locOf(org.address), 50) || '-', Pin: Number(sellerPin) || 0, Stcd: org.gstin?.slice(0, 2) ?? '' },
    BuyerDtls: { Gstin: party.gstin, LglNm: line(party.name, 100), Pos: v.placeOfSupply || party.gstin.slice(0, 2),
      Addr1: line(party.address || '', 100) || '-', Loc: line(locOf(party.address), 50) || '-', Pin: Number(buyerPin) || 0, Stcd: party.gstin.slice(0, 2) },
    ItemList: items,
    ValDtls: { AssVal: sum('AssAmt'), CgstVal: sum('CgstAmt'), SgstVal: sum('SgstAmt'), IgstVal: sum('IgstAmt'),
      RndOffAmt: r2(v.roundOff), TotInvVal: r2(v.total) },
  };
  if (v.label.length > 16) problems.push('Document number is longer than 16 characters.');
  return { json, problems };
}

async function context(c, db) {
  const o = (await c.query('select name, legal_name, gstin, address from organizations where id = $1', [db.orgId])).rows[0];
  return { name: o.name, legalName: o.legal_name, gstin: o.gstin, address: dec(o.address) };
}
async function partyOf(c, id) {
  if (!id) return null;
  const p = (await c.query('select name, gstin, address from ledgers where id = $1', [id])).rows[0];
  return p ? { name: p.name, gstin: p.gstin, address: dec(p.address) } : null;
}

export async function eInvoiceForVoucher(db, voucherId) {
  const v = await getVoucher(db, voucherId);
  return withOrg(db, async (c) => ({ voucher: v.label, ...buildEInvoice(await context(c, db), await partyOf(c, v.partyLedgerId), v) }));
}

/** All B2B sales bills and credit notes in a period: ready files plus the ones that need fixing first. */
export async function eInvoicesForPeriod(db, { from, to }) {
  if (!from || !to || from > to) throw badRequest('Choose a period (from and to dates).');
  const ids = await withOrg(db, async (c) => (await c.query(
    `select v.id from vouchers v join ledgers l on l.id = v.party_ledger_id
      where v.type in ('sales','credit_note') and v.status = 'posted' and l.gstin is not null and l.gstin <> ''
        and v.date between $1 and $2 order by v.date, v.number limit 1000`, [from, to])).rows.map((r) => r.id));
  const ready = []; const needsFix = [];
  for (const id of ids) {
    const r = await eInvoiceForVoucher(db, id);
    if (r.problems.length) needsFix.push({ voucher: r.voucher, voucherId: id, problems: r.problems });
    else ready.push(r.json);
  }
  return { from, to, ready, needsFix };
}
