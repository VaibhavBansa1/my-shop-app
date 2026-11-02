// Voucher engine: builds balanced double-entry postings (and stock lines) from a
// request, numbers it gap-free per type and financial year, and stores it.
// See docs/ARCHITECTURE.md §3.1–3.2 for the posting rules.
import { withOrg } from '../db.js';
import { audit } from './audit.js';
import { computeInvoice } from '../gst.js';
import { toPaise, toMilli, paiseToStr, milliToStr, num } from '../money.js';
import { badRequest, conflict, forbidden, notFound, validationFailed } from '../errors.js';
import { cancelledAlert, lowStockAlerts } from './notifications.js';
import { emitEvent } from '../events.js';

export const ITEM_TYPES = new Set(['sales', 'purchase', 'credit_note', 'debit_note']);
const CASH_BANK_GROUPS = new Set(['cash_in_hand', 'bank_accounts', 'bank_od']);

/** Financial year start date (YYYY-MM-DD) containing `date`, for a FY starting in month m. */
export function fyStart(date, m) {
  const [y, mo] = date.split('-').map(Number);
  const year = mo >= m ? y : y - 1;
  return `${year}-${String(m).padStart(2, '0')}-01`;
}

export { voucherNumberLabel } from './vouchers-label.js';
import { voucherNumberLabel } from './vouchers-label.js';

async function ledgersByCode(c) {
  const { rows } = await c.query('select id, code from ledgers where code is not null');
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

async function ledgerInfo(c, ids) {
  if (!ids.length) return new Map();
  const { rows } = await c.query(
    `select l.id, l.name, l.state_code, l.is_active, g.code as group_code,
            pg.code as parent_code
       from ledgers l join account_groups g on g.id = l.group_id
       left join account_groups pg on pg.id = g.parent_id
      where l.id = any($1::uuid[])`, [ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

// Roles that may not post journals (cashiers) get the narrow form of each voucher. Set by the API route.
const limitedRole = (input) => input.__limited === true;

const isCashBank = (l) => CASH_BANK_GROUPS.has(l.group_code) || CASH_BANK_GROUPS.has(l.parent_code);

/**
 * Build entries + item rows (pure-ish; reads masters through client c).
 * Returns { entries:[{ledgerId, amount(paise)}], items:[...], totals }
 */
async function buildItemVoucher(c, org, input) {
  if (!input.items.length) throw validationFailed('Add at least one item.');
  const codes = await ledgersByCode(c);
  const partyId = input.partyLedgerId || codes.cash;
  const party = (await ledgerInfo(c, [partyId])).get(partyId);
  if (!party) throw notFound('Party ledger not found.');
  if (!party.is_active) throw validationFailed('That party ledger is inactive.');

  const isSalesSide = input.type === 'sales' || input.type === 'credit_note';
  const accountId = input.accountLedgerId || (isSalesSide ? codes.sales : codes.purchase);
  const account = (await ledgerInfo(c, [accountId])).get(accountId);
  if (!account) throw notFound('Sales/Purchase ledger not found.');
  // The income/expense side of a bill must be a Sales (or Purchase) ledger. Otherwise a "sale" could credit
  // another customer or Capital and quietly move money between parties.
  const wantGroup = isSalesSide ? 'sales_accounts' : 'purchase_accounts';
  if (account.group_code !== wantGroup && account.parent_code !== wantGroup) {
    throw validationFailed(`Choose a ledger under ${isSalesSide ? 'Sales Accounts' : 'Purchase Accounts'} for this bill.`);
  }
  if (!account.is_active) throw validationFailed(`${account.name} is inactive.`);
  if (input.accountLedgerId && limitedRole(input)) throw forbidden('Your role cannot change the Sales ledger of a bill.');

  const itemIds = [...new Set(input.items.map((i) => i.stockItemId))];
  const { rows: itemRows } = await c.query(
    `select i.id, i.name, i.gst_rate, i.is_active, u.decimals from stock_items i join units u on u.id = i.unit_id
      where i.id = any($1::uuid[])`, [itemIds]);
  const items = new Map(itemRows.map((r) => [r.id, r]));

  // GST applies only when the organization is GST-registered.
  const registered = Boolean(org.gstin);
  const pos = input.placeOfSupply || party.state_code || org.state_code || null;
  const interState = registered && Boolean(org.state_code && pos && org.state_code !== pos);

  const lines = input.items.map((l, idx) => {
    const it = items.get(l.stockItemId);
    if (!it) throw notFound(`Item on line ${idx + 1} not found.`);
    if (!it.is_active) throw validationFailed(`${it.name} is inactive.`);
    const qtyMilli = toMilli(l.qty, `quantity on line ${idx + 1}`);
    if (qtyMilli <= 0) throw validationFailed(`Quantity on line ${idx + 1} must be more than 0.`);
    if (qtyMilli % 10 ** (3 - it.decimals) !== 0) {
      throw validationFailed(`${it.name} allows ${it.decimals} decimal places in quantity.`);
    }
    if (l.rate === undefined || l.rate === null || l.rate === '') throw validationFailed(`Enter a rate on line ${idx + 1}.`);
    const ratePaise = toPaise(l.rate, `rate on line ${idx + 1}`);
    const discountPaise = toPaise(l.discount ?? 0, `discount on line ${idx + 1}`);
    if (ratePaise < 0 || discountPaise < 0) throw validationFailed('Rate and discount cannot be negative.');
    const gstRateBp = registered ? toPaise(l.gstRate ?? it.gst_rate, 'GST rate') : 0;
    // Cashiers bill at the item's GST rate; changing tax is for people who manage items (GST summary integrity).
    if (registered && l.gstRate != null && limitedRole(input) && gstRateBp !== toPaise(it.gst_rate, 'GST rate')) {
      throw forbidden(`Your role cannot change the GST rate of ${it.name}. Ask an accountant to update the item.`);
    }
    if (gstRateBp < 0 || gstRateBp > 10000) throw validationFailed('GST rate must be between 0 and 100.');
    return { stockItemId: it.id, description: l.description ?? '', qtyMilli, ratePaise, discountPaise, gstRateBp };
  });

  const inv = computeInvoice(lines, { interState, roundToRupee: input.roundOff !== false });
  if (inv.total <= 0) throw validationFailed('Invoice total must be more than zero.');

  // Sign convention: +debit / -credit. Sales side credits income & output tax; purchase side debits.
  const s = { sales: -1, credit_note: 1, purchase: 1, debit_note: -1 }[input.type];
  const taxCodes = isSalesSide
    ? { cgst: codes.output_cgst, sgst: codes.output_sgst, igst: codes.output_igst }
    : { cgst: codes.input_cgst, sgst: codes.input_sgst, igst: codes.input_igst };
  const entries = [
    { ledgerId: partyId, amount: -s * inv.total },
    { ledgerId: accountId, amount: s * inv.taxable },
  ];
  for (const k of ['cgst', 'sgst', 'igst']) if (inv[k]) entries.push({ ledgerId: taxCodes[k], amount: s * inv[k] });
  if (inv.roundOff) entries.push({ ledgerId: codes.round_off, amount: s * inv.roundOff });

  const stockSign = { sales: -1, credit_note: 1, purchase: 1, debit_note: -1 }[input.type];
  const itemRowsOut = lines.map((l, i) => ({
    ...l, ...inv.lines[i], stockQtyMilli: stockSign * l.qtyMilli,
  }));
  return {
    partyLedgerId: partyId, placeOfSupply: pos, entries: entries.filter((e) => e.amount !== 0), items: itemRowsOut,
    totals: { taxable: inv.taxable, tax: inv.tax, roundOff: inv.roundOff, total: inv.total },
  };
}

/** Stock adjustment: quantities in/out at cost, no ledger entries, reason required. */
async function buildAdjustment(c, input) {
  if (!input.items.length) throw validationFailed('Add at least one item.');
  if (input.entries.length) throw validationFailed('A stock adjustment has no ledger lines.');
  if (!input.narration?.trim()) throw validationFailed('Give a reason (e.g. damaged, expired, stock count).');
  const ids = [...new Set(input.items.map((i) => i.stockItemId))];
  const { rows } = await c.query(
    `select i.id, i.name, i.is_active, i.purchase_price, i.opening_rate, u.decimals from stock_items i join units u on u.id = i.unit_id
      where i.id = any($1::uuid[])`, [ids]);
  const items = new Map(rows.map((r) => [r.id, r]));
  const lines = input.items.map((l, idx) => {
    const it = items.get(l.stockItemId);
    if (!it) throw notFound(`Item on line ${idx + 1} not found.`);
    if (!l.direction) throw validationFailed(`Choose in or out on line ${idx + 1}.`);
    const qtyMilli = toMilli(l.qty, `quantity on line ${idx + 1}`);
    if (qtyMilli <= 0) throw validationFailed(`Quantity on line ${idx + 1} must be more than 0.`);
    if (qtyMilli % 10 ** (3 - it.decimals) !== 0) throw validationFailed(`${it.name} allows ${it.decimals} decimal places in quantity.`);
    const ratePaise = toPaise(l.rate ?? (Number(it.purchase_price) || Number(it.opening_rate) || 0), 'rate');
    return { stockItemId: it.id, description: l.description ?? '', qtyMilli, ratePaise, discountPaise: 0, gstRateBp: 0,
      taxable: 0, cgst: 0, sgst: 0, igst: 0, stockQtyMilli: l.direction === 'out' ? -qtyMilli : qtyMilli };
  });
  return { partyLedgerId: null, placeOfSupply: null, entries: [], items: lines, totals: { taxable: 0, tax: 0, roundOff: 0, total: 0 } };
}

async function buildAccountVoucher(c, input) {
  if (input.items.length) throw validationFailed('Items are only allowed on sales, purchase and note vouchers.');
  if (input.entries.length < 2) throw validationFailed('Add at least one debit and one credit line.');
  const entries = input.entries.map((e, i) => {
    const amt = e.debit != null ? toPaise(e.debit, `debit on line ${i + 1}`) : -toPaise(e.credit, `credit on line ${i + 1}`);
    if (amt === 0 || (e.debit != null && amt < 0) || (e.credit != null && amt > 0)) {
      throw validationFailed(`Amount on line ${i + 1} must be more than zero.`);
    }
    return { ledgerId: e.ledgerId, amount: amt };
  });
  const sum = entries.reduce((a, e) => a + e.amount, 0);
  if (sum !== 0) throw validationFailed(`Debits and credits must be equal (difference ${paiseToStr(Math.abs(sum))}).`);

  const info = await ledgerInfo(c, [...new Set(entries.map((e) => e.ledgerId))]);
  for (const e of entries) {
    const l = info.get(e.ledgerId);
    if (!l) throw notFound('A ledger in this voucher was not found.');
    if (!l.is_active) throw validationFailed(`${l.name} is inactive.`);
  }
  const dr = entries.filter((e) => e.amount > 0).map((e) => info.get(e.ledgerId));
  const cr = entries.filter((e) => e.amount < 0).map((e) => info.get(e.ledgerId));
  if (input.type === 'receipt' && !dr.some(isCashBank)) throw validationFailed('A receipt must debit a cash or bank ledger.');
  // A cashier's receipt is exactly "money in from someone": every debit is cash/bank and nothing else, every
  // credit is not cash/bank. Without this, extra lines would turn a receipt into a journal or contra
  // (e.g. Cash Dr 1 + Salary Dr 9,999 / Customer Cr 10,000 wipes a customer's dues), which needs an accountant.
  if (input.type === 'receipt' && limitedRole(input) && !(dr.every(isCashBank) && !cr.some(isCashBank))) {
    throw forbidden('A receipt can only take money into cash/bank from customers or other ledgers. Ask an accountant for adjustments.');
  }
  if (input.type === 'payment' && !cr.some(isCashBank)) throw validationFailed('A payment must credit a cash or bank ledger.');
  if (input.type === 'contra' && ![...dr, ...cr].every(isCashBank)) throw validationFailed('Contra is only between cash and bank ledgers.');

  const total = entries.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
  let party = input.partyLedgerId || null;
  if (!party && (input.type === 'receipt' || input.type === 'payment')) {
    const p = (input.type === 'receipt' ? cr : dr).find((l) => !isCashBank(l));
    party = p?.id ?? null;
  }
  return { partyLedgerId: party, placeOfSupply: null, entries, items: [], totals: { taxable: 0, tax: 0, roundOff: 0, total } };
}

export async function createVoucher(db, input, { beforeCommit } = {}) {
  return withOrg(db, async (c) => {
    const { rows: orgRows } = await c.query('select id, gstin, state_code, fy_start_month, books_from from organizations where id = $1', [db.orgId]);
    const org = orgRows[0];
    if (input.date < String(org.books_from)) throw validationFailed(`Date is before the books start date (${org.books_from}).`);
    // Future dates: allow up to 31 days ahead (post-dated bills), refuse more (usually a typo in the year).
    const { rows: lim } = await c.query("select (current_date + 31)::text as max");
    if (input.date > lim[0].max) throw validationFailed('Date is too far in the future. Check the year.');
    const built = input.type === 'stock_adjustment' ? await buildAdjustment(c, input)
      : ITEM_TYPES.has(input.type) ? await buildItemVoucher(c, org, input) : await buildAccountVoucher(c, input);

    // The same supplier bill entered twice is a common (and costly) mistake, especially with scanning.
    if (input.type === 'purchase' && built.partyLedgerId && input.reference?.trim()) {
      // Serialise entries of the same supplier bill so two people saving it at once cannot both pass the check.
      await c.query('select pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`purchase-ref:${db.orgId}:${built.partyLedgerId}:${input.reference.trim().toLowerCase()}`]);
      const { rows: dup } = await c.query(
        `select type, fy_start, number from vouchers
          where type = 'purchase' and status = 'posted' and party_ledger_id = $1 and lower(trim(reference)) = lower(trim($2))
            and ($3::uuid is null or id <> $3) limit 1`, [built.partyLedgerId, input.reference, input.replacesVoucherId ?? null]);
      if (dup.length) throw conflict(`This supplier bill (${input.reference.trim()}) is already entered as ${voucherNumberLabel(dup[0].type, dup[0].fy_start, dup[0].number)}.`);
    }

    const fy = fyStart(input.date, org.fy_start_month);
    const seq = await c.query(
      `insert into voucher_sequences (org_id, type, fy_start, next_no) values ($1, $2, $3, 2)
       on conflict (org_id, type, fy_start) do update set next_no = voucher_sequences.next_no + 1
       returning next_no - 1 as number`, [db.orgId, input.type, fy]);
    const number = seq.rows[0].number;

    const { rows } = await c.query(
      `insert into vouchers (org_id, type, fy_start, number, date, party_ledger_id, place_of_supply, reference, narration,
          taxable_total, tax_total, round_off, total, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [db.orgId, input.type, fy, number, input.date, built.partyLedgerId, built.placeOfSupply, input.reference,
       input.narration, paiseToStr(built.totals.taxable), paiseToStr(built.totals.tax), paiseToStr(built.totals.roundOff),
       paiseToStr(built.totals.total), db.userId]);
    const id = rows[0].id;

    // Bulk insert entries and items with unnest (one round trip each).
    await c.query(
      `insert into voucher_entries (org_id, voucher_id, line_no, ledger_id, amount)
       select $1, $2, t.n, t.l, t.a from unnest($3::int[], $4::uuid[], $5::numeric[]) as t(n, l, a)`,
      [db.orgId, id, built.entries.map((_, i) => i + 1), built.entries.map((e) => e.ledgerId),
       built.entries.map((e) => paiseToStr(e.amount))]);
    if (built.items.length) {
      const it = built.items;
      await c.query(
        `insert into voucher_items (org_id, voucher_id, line_no, stock_item_id, description, qty, rate, discount,
            taxable_value, gst_rate, cgst, sgst, igst, stock_qty)
         select $1, $2, t.* from unnest($3::int[], $4::uuid[], $5::text[], $6::numeric[], $7::numeric[], $8::numeric[],
            $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[], $14::numeric[]) as t`,
        [db.orgId, id, it.map((_, i) => i + 1), it.map((l) => l.stockItemId), it.map((l) => l.description),
         it.map((l) => milliToStr(l.qtyMilli)), it.map((l) => paiseToStr(l.ratePaise)), it.map((l) => paiseToStr(l.discountPaise)),
         it.map((l) => paiseToStr(l.taxable)), it.map((l) => paiseToStr(l.gstRateBp)), it.map((l) => paiseToStr(l.cgst)),
         it.map((l) => paiseToStr(l.sgst)), it.map((l) => paiseToStr(l.igst)), it.map((l) => milliToStr(l.stockQtyMilli))]);
    }
    await audit(c, db, 'voucher.create', 'voucher', id, { type: input.type, number, total: paiseToStr(built.totals.total) });

    await emitEvent(c, db, 'voucher.created', { voucherId: id, type: input.type, label: voucherNumberLabel(input.type, fy, number), date: input.date,
      partyLedgerId: built.partyLedgerId, taxable: paiseToStr(built.totals.taxable), tax: paiseToStr(built.totals.tax), total: paiseToStr(built.totals.total),
      items: built.items.map((l) => ({ stockItemId: l.stockItemId, qty: milliToStr(l.qtyMilli), stockQty: milliToStr(l.stockQtyMilli), rate: paiseToStr(l.ratePaise) })),
      replaces: input.replacesVoucherId ?? null });
    if (input.type === 'sales' || input.type === 'debit_note' || input.type === 'stock_adjustment') await lowStockAlerts(c, db, id);

    if (input.replacesVoucherId) {
      // Correction: atomically cancel the original, pointing at its replacement.
      const old = await c.query('select type, fy_start, number, status from vouchers where id = $1 for update', [input.replacesVoucherId]);
      if (!old.rowCount) throw notFound('The voucher being corrected was not found.');
      if (old.rows[0].status !== 'posted') throw badRequest('The voucher being corrected is already cancelled.');
      if (old.rows[0].type !== input.type) throw badRequest('A correction must be the same voucher type as the original.');
      const label = voucherNumberLabel(input.type, fy, number);
      await c.query(
        `update vouchers set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 where id = $1`,
        [input.replacesVoucherId, db.userId, `Corrected: replaced by ${label}`]);
      await audit(c, db, 'voucher.cancel', 'voucher', input.replacesVoucherId, { reason: `replaced by ${label}`, replacedBy: id });
      const o = (await c.query('select id, type, fy_start, number, total from vouchers where id = $1', [input.replacesVoucherId])).rows[0];
      await cancelledAlert(c, db, o, `Corrected: replaced by ${label}`);
    }
    const out = await loadVoucher(c, id);
    if (beforeCommit) await beforeCommit(c, out);   // e.g. store the idempotent response in the same transaction
    return out;
  });
}

export async function cancelVoucher(db, id, reason) {
  return withOrg(db, async (c) => {
    const r = await c.query(
      `update vouchers set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
        where id = $1 and status = 'posted' returning id`, [id, db.userId, reason]);
    if (!r.rowCount) {
      const exists = await c.query('select status from vouchers where id = $1', [id]);
      if (!exists.rowCount) throw notFound('Voucher not found.');
      throw badRequest('This voucher is already cancelled.');
    }
    await audit(c, db, 'voucher.cancel', 'voucher', id, { reason });
    const v = (await c.query('select id, type, fy_start, number, total from vouchers where id = $1', [id])).rows[0];
    await cancelledAlert(c, db, v, reason);
    await emitEvent(c, db, 'voucher.cancelled', { voucherId: id, type: v.type, label: voucherNumberLabel(v.type, v.fy_start, v.number), total: v.total, reason });
    return loadVoucher(c, id);
  });
}

function mapVoucherRow(r) {
  return {
    id: r.id, type: r.type, number: r.number, label: voucherNumberLabel(r.type, r.fy_start, r.number), date: r.date,
    fyStart: r.fy_start, partyLedgerId: r.party_ledger_id, partyName: r.party_name, placeOfSupply: r.place_of_supply,
    reference: r.reference, narration: r.narration, taxableTotal: num(r.taxable_total), taxTotal: num(r.tax_total),
    roundOff: num(r.round_off), total: num(r.total), status: r.status, cancelReason: r.cancel_reason,
    cancelledAt: r.cancelled_at, createdBy: r.created_by_name, createdAt: r.created_at,
  };
}

async function loadVoucher(c, id) {
  const { rows } = await c.query(
    `select v.*, l.name as party_name, u.name as created_by_name from vouchers v
       left join ledgers l on l.id = v.party_ledger_id left join users u on u.id = v.created_by
      where v.id = $1`, [id]);
  if (!rows.length) throw notFound('Voucher not found.');
  const entries = await c.query(
    `select e.line_no, e.ledger_id, e.amount, l.name from voucher_entries e join ledgers l on l.id = e.ledger_id
      where e.voucher_id = $1 order by e.line_no`, [id]);
  const items = await c.query(
    `select vi.*, si.name, si.hsn_code, u.symbol as unit from voucher_items vi
       join stock_items si on si.id = vi.stock_item_id join units u on u.id = si.unit_id
      where vi.voucher_id = $1 order by vi.line_no`, [id]);
  return {
    ...mapVoucherRow(rows[0]),
    entries: entries.rows.map((e) => ({ ledgerId: e.ledger_id, ledgerName: e.name, debit: num(e.amount) > 0 ? num(e.amount) : 0,
      credit: num(e.amount) < 0 ? -num(e.amount) : 0 })),
    items: items.rows.map((i) => ({ stockItemId: i.stock_item_id, name: i.name, hsnCode: i.hsn_code, unit: i.unit,
      description: i.description, qty: num(i.qty), rate: num(i.rate), discount: num(i.discount),
      taxableValue: num(i.taxable_value), gstRate: num(i.gst_rate), cgst: num(i.cgst), sgst: num(i.sgst), igst: num(i.igst), stockQty: num(i.stock_qty) })),
  };
}

export async function getVoucher(db, id) {
  return withOrg(db, (c) => loadVoucher(c, id));
}

export async function listVouchers(db, { type, from, to, partyLedgerId, limit = 100, offset = 0 } = {}) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `select v.*, l.name as party_name, u.name as created_by_name from vouchers v
         left join ledgers l on l.id = v.party_ledger_id left join users u on u.id = v.created_by
        where ($1::voucher_type is null or v.type = $1)
          and ($2::date is null or v.date >= $2) and ($3::date is null or v.date <= $3)
          and ($4::uuid is null or v.party_ledger_id = $4)
        order by v.date desc, v.created_at desc limit $5 offset $6`,
      [type || null, from || null, to || null, partyLedgerId || null, Math.min(Number(limit) || 100, 500), Math.max(Number(offset) || 0, 0)]);
    return rows.map(mapVoucherRow);
  });
}
