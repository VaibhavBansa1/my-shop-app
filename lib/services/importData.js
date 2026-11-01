// CSV import of stock items and customers/suppliers. The browser parses the file (shared/csv.js)
// and sends rows; the server validates every row with the same rules as the forms, reports all
// problems by row number, and saves everything in ONE transaction (all rows or none).
import { withOrg } from '../db.js';
import { audit } from './audit.js';
import { insertItem, insertLedger } from './masters.js';
import { itemSchema, ledgerCreateChecked } from '../validation.js';
import { badRequest } from '../errors.js';

export const MAX_IMPORT_ROWS = 5000;

const pick = (r, ...names) => { for (const n of names) if (r[n] !== undefined && r[n] !== '') return r[n]; return undefined; };
const num = (v) => (v === undefined ? undefined : v.replace(/[₹,\s]/g, ''));

export const TEMPLATES = {
  items: ['name', 'sku', 'unit', 'hsn', 'gst_rate', 'sale_price', 'purchase_price', 'reorder_level', 'opening_qty', 'opening_rate'],
  parties: ['name', 'type', 'phone', 'email', 'gstin', 'state_code', 'address', 'opening_balance'],
};

function mapItem(r, units) {
  const unitKey = (pick(r, 'unit', 'uom', 'units') ?? 'pcs').toLowerCase();
  const unit = units.find((u) => u.symbol.toLowerCase() === unitKey || u.name.toLowerCase() === unitKey);
  if (!unit) return { error: `Unknown unit "${unitKey}". Use one of: ${units.map((u) => u.symbol).join(', ')}.` };
  const raw = {
    name: pick(r, 'name', 'item', 'item_name', 'product'), sku: pick(r, 'sku', 'code', 'item_code', 'barcode') ?? '',
    unitId: unit.id, hsnCode: pick(r, 'hsn', 'hsn_code', 'sac', 'hsn_sac') ?? '',
    gstRate: num(pick(r, 'gst_rate', 'gst', 'gst_percent', 'tax_rate')), salePrice: num(pick(r, 'sale_price', 'price', 'mrp', 'selling_price')),
    purchasePrice: num(pick(r, 'purchase_price', 'cost', 'cost_price')), reorderLevel: num(pick(r, 'reorder_level', 'min_stock', 'reorder')),
    openingQty: num(pick(r, 'opening_qty', 'opening_stock', 'stock', 'qty', 'quantity')), openingRate: num(pick(r, 'opening_rate', 'opening_cost')),
  };
  const p = itemSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)));
  return p.success ? { value: p.data } : { error: p.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') };
}

function mapParty(r, groups) {
  const type = (pick(r, 'type', 'kind', 'party_type') ?? 'customer').toLowerCase();
  const code = /supp|vendor|creditor/.test(type) ? 'sundry_creditors' : /cust|debtor|client/.test(type) ? 'sundry_debtors' : null;
  if (!code) return { error: `Type must be customer or supplier (got "${type}").` };
  const opening = num(pick(r, 'opening_balance', 'balance', 'opening', 'due'));
  const raw = {
    name: pick(r, 'name', 'party', 'party_name', 'customer', 'supplier'), groupId: groups[code],
    phone: pick(r, 'phone', 'mobile', 'phone_number', 'contact') ?? '', email: (pick(r, 'email', 'e_mail') ?? '').toLowerCase(),
    gstin: (pick(r, 'gstin', 'gst_no', 'gst_number') ?? '').toUpperCase(), stateCode: pick(r, 'state_code', 'state') ?? '',
    address: pick(r, 'address') ?? '',
    // A customer's balance is what they owe you (debit); a supplier's is what you owe them (credit).
    openingBalance: opening === undefined ? '0' : (code === 'sundry_creditors' ? `-${opening.replace(/^-/, '')}` : opening),
  };
  if (raw.stateCode && !/^\d{2}$/.test(raw.stateCode)) return { error: 'state_code must be the 2-digit GST state code (e.g. 23).' };
  const p = ledgerCreateChecked.safeParse(raw);
  return p.success ? { value: p.data } : { error: p.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') };
}

/**
 * @param {'items'|'parties'} kind
 * @param {object[]} rows  objects keyed by normalised header
 * @param {{dryRun?: boolean, skipExisting?: boolean}} opts
 */
export async function importRows(db, kind, rows, { dryRun = true, skipExisting = false } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw badRequest('The file has no data rows.');
  if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);
  return withOrg(db, async (c) => {
    const ctx = kind === 'items'
      ? { units: (await c.query('select id, symbol, name from units')).rows,
          existing: new Set((await c.query('select lower(name) n from stock_items')).rows.map((r) => r.n)) }
      : { groups: Object.fromEntries((await c.query("select code, id from account_groups where code in ('sundry_debtors', 'sundry_creditors')")).rows.map((r) => [r.code, r.id])),
          existing: new Set((await c.query('select lower(name) n from ledgers')).rows.map((r) => r.n)) };
    const seen = new Set();
    const results = rows.map((r, i) => {
      const line = i + 2; // row 1 is the header
      if (typeof r !== 'object' || r === null) return { line, error: 'Unreadable row.' };
      const m = kind === 'items' ? mapItem(r, ctx.units) : mapParty(r, ctx.groups);
      if (m.error) return { line, error: m.error };
      const key = m.value.name.toLowerCase();
      if (seen.has(key)) return { line, error: `"${m.value.name}" appears twice in the file.` };
      seen.add(key);
      if (ctx.existing.has(key)) return skipExisting ? { line, skipped: true, name: m.value.name } : { line, error: `"${m.value.name}" already exists.` };
      return { line, value: m.value };
    });
    const errors = results.filter((r) => r.error).map(({ line, error }) => ({ line, error }));
    const ready = results.filter((r) => r.value);
    const summary = { total: rows.length, ready: ready.length, skipped: results.filter((r) => r.skipped).length, errors: errors.slice(0, 200), errorCount: errors.length,
      preview: ready.slice(0, 10).map((r) => r.value) };
    if (dryRun || errors.length) return { ...summary, imported: 0, dryRun: true };
    for (const r of ready) {
      if (kind === 'items') await insertItem(c, db, r.value, { auditIt: false });
      else await insertLedger(c, db, r.value, { auditIt: false });
    }
    await audit(c, db, `import.${kind}`, 'organization', db.orgId, { rows: ready.length, skipped: summary.skipped });
    return { ...summary, imported: ready.length, dryRun: false };
  });
}
