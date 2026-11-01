// Full backup of one business as JSON (data portability; also a safety net for owners).
// Runs under RLS, so it can only ever contain the caller's own organization.
import { withOrg } from '../db.js';
import { audit } from './audit.js';
import { decryptField as dec } from '../crypto.js';

const TABLES = [
  ['organization', 'select id, name, legal_name, gstin, state_code, country, currency, address, phone, email, fy_start_month, books_from, created_at from organizations where id = app_org_id()'],
  ['members', `select u.name, u.email, m.role, m.created_at from memberships m join users u on u.id = m.user_id where m.org_id = app_org_id() order by m.created_at`],
  ['groups', 'select id, parent_id, name, code, nature, affects_gross_profit, is_system from account_groups order by name'],
  ['ledgers', 'select id, group_id, name, code, opening_balance, gstin, state_code, phone, email, address, is_system, is_active, created_at from ledgers order by name'],
  ['units', 'select id, symbol, name, decimals from units order by symbol'],
  ['stockItems', 'select id, name, sku, unit_id, hsn_code, gst_rate, sale_price, purchase_price, reorder_level, opening_qty, opening_rate, is_active, created_at from stock_items order by name'],
  ['vouchers', 'select id, type, fy_start, number, date, party_ledger_id, place_of_supply, reference, narration, taxable_total, tax_total, round_off, total, status, cancel_reason, cancelled_at, created_at from vouchers order by date, created_at'],
  ['voucherEntries', 'select voucher_id, line_no, ledger_id, amount from voucher_entries order by voucher_id, line_no'],
  ['voucherItems', 'select voucher_id, line_no, stock_item_id, description, qty, rate, discount, taxable_value, gst_rate, cgst, sgst, igst, stock_qty from voucher_items order by voucher_id, line_no'],
];

export async function exportOrganization(db) {
  return withOrg(db, async (c) => {
    const out = { format: 'my-shop-backup', version: 1, exportedAt: new Date().toISOString(), note: 'Amounts are decimal strings in the business currency. Debit positive, credit negative.' };
    for (const [key, sql] of TABLES) out[key] = (await c.query(sql)).rows;
    out.organization = out.organization[0];
    // The backup is for the business itself: contact fields are decrypted.
    for (const r of [out.organization, ...out.ledgers]) for (const f of ['phone', 'email', 'address']) if (f in r) r[f] = dec(r[f]);
    await audit(c, db, 'org.export', 'organization', db.orgId, { vouchers: out.vouchers.length });
    return out;
  });
}
