// Financial and inventory reports. All figures come from posted vouchers +
// opening balances; nothing is stored as a running counter (ADR-0002).
import { withOrg } from '../db.js';
import { num } from '../money.js';
import { notFound } from '../errors.js';
import { voucherNumberLabel } from './vouchers.js';

const r2 = (x) => Math.round(x * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

async function orgRow(c, orgId) {
  return (await c.query('select books_from, fy_start_month from organizations where id = $1', [orgId])).rows[0];
}

/** Ledger balances (opening + posted entries up to `to`, optionally from `from`). Dr positive. */
async function ledgerBalances(c, { from = null, to }) {
  const { rows } = await c.query(
    `select l.id, l.name, l.group_id, l.opening_balance, g.nature, g.code as group_code, g.name as group_name,
            coalesce(sum(e.amount) filter (where v.date < $1::date), 0) as before,
            coalesce(sum(e.amount) filter (where ($1::date is null or v.date >= $1::date) and v.date <= $2::date), 0) as period
       from ledgers l
       join account_groups g on g.id = l.group_id
       left join voucher_entries e on e.ledger_id = l.id
       left join vouchers v on v.id = e.voucher_id and v.status = 'posted'
      group by l.id, g.id
      order by g.name, l.name`, [from, to]);
  return rows.map((r) => ({
    id: r.id, name: r.name, groupId: r.group_id, groupName: r.group_name, groupCode: r.group_code, nature: r.nature,
    opening: num(r.opening_balance) + num(r.before), period: num(r.period),
    closing: num(r.opening_balance) + num(r.before) + num(r.period),
  }));
}

/** Map each group to its top-level (primary) group. */
async function groupTree(c) {
  const { rows } = await c.query('select id, name, parent_id, nature, affects_gross_profit, code from account_groups');
  const byId = new Map(rows.map((g) => [g.id, g]));
  const primary = (id) => { let g = byId.get(id); while (g.parent_id) g = byId.get(g.parent_id); return g; };
  return { byId, primary };
}

export async function trialBalance(db, { to = today() } = {}) {
  return withOrg(db, async (c) => {
    const rows = (await ledgerBalances(c, { to })).filter((l) => r2(l.closing) !== 0);
    const out = rows.map((l) => ({ ledgerId: l.id, ledger: l.name, group: l.groupName,
      debit: l.closing > 0 ? r2(l.closing) : 0, credit: l.closing < 0 ? r2(-l.closing) : 0 }));
    // Like Tally, the trial balance carries opening stock (items' opening value) as a debit.
    const { rows: os } = await c.query('select coalesce(sum(opening_qty * opening_rate), 0) v from stock_items');
    const openingStock = r2(num(os[0].v));
    if (openingStock) out.unshift({ ledgerId: null, ledger: 'Opening Stock', group: 'Stock-in-Hand', debit: openingStock, credit: 0 });
    const totalDebit = r2(out.reduce((a, x) => a + x.debit, 0));
    const totalCredit = r2(out.reduce((a, x) => a + x.credit, 0));
    return { asOf: to, rows: out, totalDebit, totalCredit, differenceInOpening: r2(totalDebit - totalCredit) };
  });
}

/** Stock quantity and weighted-average cost value of every item as of `date` (inclusive). */
async function stockValuation(c, date) {
  const { rows } = await c.query(
    `select i.id, i.name, i.sku, i.reorder_level, i.opening_qty, i.opening_rate, i.purchase_price, u.symbol,
            coalesce(sum(vi.stock_qty) filter (where v.date <= $1::date), 0) as moved,
            coalesce(sum(vi.qty) filter (where v.type = 'purchase' and v.date <= $1::date), 0) as in_qty,
            coalesce(sum(vi.taxable_value) filter (where v.type = 'purchase' and v.date <= $1::date), 0) as in_value
       from stock_items i join units u on u.id = i.unit_id
       left join voucher_items vi on vi.stock_item_id = i.id
       left join vouchers v on v.id = vi.voucher_id and v.status = 'posted'
      group by i.id, u.symbol order by i.name`, [date]);
  return rows.map((r) => {
    const openQty = num(r.opening_qty);
    const qty = openQty + num(r.moved);
    const costQty = openQty + num(r.in_qty);
    const costVal = openQty * num(r.opening_rate) + num(r.in_value);
    const avg = costQty > 0 ? costVal / costQty : num(r.purchase_price);
    return { itemId: r.id, name: r.name, sku: r.sku, unit: r.symbol, qty: Math.round(qty * 1000) / 1000,
      avgCost: r2(avg), value: r2(Math.max(qty, 0) * avg), reorderLevel: num(r.reorder_level),
      low: qty <= num(r.reorder_level), openingValue: r2(openQty * num(r.opening_rate)) };
  });
}

export async function stockSummary(db, { to = today() } = {}) {
  return withOrg(db, async (c) => {
    const items = await stockValuation(c, to);
    return { asOf: to, items, totalValue: r2(items.reduce((a, i) => a + i.value, 0)), lowCount: items.filter((i) => i.low).length };
  });
}

function dayBefore(d) {
  const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10);
}

async function computePL(c, orgId, from, to) {
  const org = await orgRow(c, orgId);
  const { byId, primary } = await groupTree(c);
  const bal = await ledgerBalances(c, { from, to });
  // Opening stock: at books start it is the items' opening value; later, valuation the day before `from`.
  const startsAtBooks = from <= String(org.books_from);
  const openingItems = startsAtBooks ? null : await stockValuation(c, dayBefore(from));
  const closingItems = await stockValuation(c, to);
  const openingStock = startsAtBooks
    ? r2(closingItems.reduce((a, i) => a + i.openingValue, 0))
    : r2(openingItems.reduce((a, i) => a + i.value, 0));
  const closingStock = r2(closingItems.reduce((a, i) => a + i.value, 0));

  const sections = {};
  for (const l of bal) {
    if (l.nature !== 'income' && l.nature !== 'expense') continue;
    // Income/expense: use only the period movement (plus opening balance if the period starts at books start).
    const amt = l.period + (startsAtBooks ? l.opening : 0);
    const value = l.nature === 'income' ? -amt : amt;
    if (r2(value) === 0) continue;
    const p = primary(l.groupId);
    const key = p.name;
    sections[key] ??= { group: key, nature: p.nature, gross: byId.get(p.id).affects_gross_profit, amount: 0, ledgers: [] };
    sections[key].amount = r2(sections[key].amount + value);
    sections[key].ledgers.push({ ledgerId: l.id, ledger: l.name, amount: r2(value) });
  }
  const list = Object.values(sections);
  const sum = (f) => r2(list.filter(f).reduce((a, s) => a + s.amount, 0));
  const directIncome = sum((s) => s.gross && s.nature === 'income');
  const directExpense = sum((s) => s.gross && s.nature === 'expense');
  const indirectIncome = sum((s) => !s.gross && s.nature === 'income');
  const indirectExpense = sum((s) => !s.gross && s.nature === 'expense');
  const grossProfit = r2(directIncome + closingStock - openingStock - directExpense);
  const netProfit = r2(grossProfit + indirectIncome - indirectExpense);
  return { from, to, openingStock, closingStock, sections: list, directIncome, directExpense, indirectIncome,
    indirectExpense, grossProfit, netProfit };
}

export async function profitLoss(db, { from, to = today() } = {}) {
  return withOrg(db, async (c) => {
    const org = await orgRow(c, db.orgId);
    return computePL(c, db.orgId, from || String(org.books_from), to);
  });
}

export async function balanceSheet(db, { to = today() } = {}) {
  return withOrg(db, async (c) => {
    const org = await orgRow(c, db.orgId);
    const { primary } = await groupTree(c);
    const bal = await ledgerBalances(c, { to });
    const pl = await computePL(c, db.orgId, String(org.books_from), to);
    const items = await stockValuation(c, to);
    const openingStockValue = r2(items.reduce((a, i) => a + i.openingValue, 0));

    const assets = {}; const liabilities = {};
    for (const l of bal) {
      if (l.nature === 'income' || l.nature === 'expense') continue;
      if (r2(l.closing) === 0) continue;
      const p = primary(l.groupId);
      const side = l.nature === 'asset' ? assets : liabilities;
      const value = l.nature === 'asset' ? l.closing : -l.closing;
      side[p.name] ??= { group: p.name, amount: 0, ledgers: [] };
      side[p.name].amount = r2(side[p.name].amount + value);
      side[p.name].ledgers.push({ ledgerId: l.id, ledger: l.name, amount: r2(value) });
    }
    // Sum of every ledger's opening balance (Dr+) plus opening stock must be zero for the books to tie.
    const { rows } = await c.query('select coalesce(sum(opening_balance), 0) as s from ledgers');
    const openingDiff = r2(num(rows[0].s) + openingStockValue);

    if (pl.closingStock) {
      assets['Current Assets'] ??= { group: 'Current Assets', amount: 0, ledgers: [] };
      assets['Current Assets'].amount = r2(assets['Current Assets'].amount + pl.closingStock);
      assets['Current Assets'].ledgers.push({ ledgerId: null, ledger: 'Closing Stock', amount: pl.closingStock });
    }
    const liabilityList = Object.values(liabilities);
    liabilityList.push({ group: 'Profit & Loss A/c', amount: pl.netProfit, ledgers: [] });
    if (openingDiff) liabilityList.push({ group: 'Difference in opening balances', amount: openingDiff, ledgers: [] });
    const assetList = Object.values(assets);
    const totalAssets = r2(assetList.reduce((a, s) => a + s.amount, 0));
    const totalLiabilities = r2(liabilityList.reduce((a, s) => a + s.amount, 0));
    return { asOf: to, assets: assetList, liabilities: liabilityList, totalAssets, totalLiabilities, netProfit: pl.netProfit };
  });
}

export async function ledgerStatement(db, ledgerId, { from, to = today() } = {}) {
  return withOrg(db, async (c) => {
    const org = await orgRow(c, db.orgId);
    from ||= String(org.books_from);
    const l = await c.query('select id, name, opening_balance from ledgers where id = $1', [ledgerId]);
    if (!l.rowCount) throw notFound('Ledger not found.');
    const before = await c.query(
      `select coalesce(sum(e.amount), 0) s from voucher_entries e join vouchers v on v.id = e.voucher_id
        where e.ledger_id = $1 and v.status = 'posted' and v.date < $2`, [ledgerId, from]);
    const opening = num(l.rows[0].opening_balance) + num(before.rows[0].s);
    const { rows } = await c.query(
      `select v.id, v.type, v.fy_start, v.number, v.date, v.narration, e.amount,
              (select string_agg(l2.name, ', ' order by e2.line_no) from voucher_entries e2 join ledgers l2 on l2.id = e2.ledger_id
                where e2.voucher_id = v.id and e2.ledger_id <> $1) as against
         from voucher_entries e join vouchers v on v.id = e.voucher_id
        where e.ledger_id = $1 and v.status = 'posted' and v.date between $2 and $3
        order by v.date, v.created_at, e.line_no`, [ledgerId, from, to]);
    let running = opening;
    const lines = rows.map((r) => {
      running += num(r.amount);
      return { voucherId: r.id, date: r.date, type: r.type, label: voucherNumberLabel(r.type, r.fy_start, r.number),
        particulars: r.against, narration: r.narration, debit: num(r.amount) > 0 ? num(r.amount) : 0,
        credit: num(r.amount) < 0 ? -num(r.amount) : 0, balance: r2(running) };
    });
    return { ledgerId, ledger: l.rows[0].name, from, to, opening: r2(opening), closing: r2(running), lines };
  });
}

export async function dayBook(db, { from = today(), to = today() } = {}) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `select v.id, v.type, v.fy_start, v.number, v.date, v.total, v.status, v.narration, l.name as party
         from vouchers v left join ledgers l on l.id = v.party_ledger_id
        where v.date between $1 and $2 order by v.date, v.created_at`, [from, to]);
    const list = rows.map((r) => ({ voucherId: r.id, date: r.date, type: r.type, label: voucherNumberLabel(r.type, r.fy_start, r.number),
      party: r.party, total: num(r.total), status: r.status, narration: r.narration }));
    const totals = {};
    for (const v of list) if (v.status === 'posted') totals[v.type] = r2((totals[v.type] ?? 0) + v.total);
    return { from, to, vouchers: list, totals };
  });
}

export async function gstSummary(db, { from, to = today() } = {}) {
  return withOrg(db, async (c) => {
    const org = await orgRow(c, db.orgId);
    from ||= String(org.books_from);
    const { rows } = await c.query(
      `select v.type, vi.gst_rate, sum(vi.taxable_value) taxable, sum(vi.cgst) cgst, sum(vi.sgst) sgst, sum(vi.igst) igst
         from voucher_items vi join vouchers v on v.id = vi.voucher_id
        where v.status = 'posted' and v.date between $1 and $2
        group by v.type, vi.gst_rate order by vi.gst_rate`, [from, to]);
    const bucket = () => ({});
    const outward = bucket(); const inward = bucket();
    for (const r of rows) {
      const side = r.type === 'sales' || r.type === 'credit_note' ? outward : inward;
      const sign = r.type === 'credit_note' || r.type === 'debit_note' ? -1 : 1;
      const k = String(num(r.gst_rate));
      side[k] ??= { rate: num(r.gst_rate), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      for (const f of ['taxable', 'cgst', 'sgst', 'igst']) side[k][f] = r2(side[k][f] + sign * num(r[f]));
    }
    const tot = (side) => Object.values(side).reduce((a, x) => ({ taxable: r2(a.taxable + x.taxable), cgst: r2(a.cgst + x.cgst),
      sgst: r2(a.sgst + x.sgst), igst: r2(a.igst + x.igst) }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
    const o = tot(outward); const i = tot(inward);
    const outTax = r2(o.cgst + o.sgst + o.igst); const inTax = r2(i.cgst + i.sgst + i.igst);
    return { from, to, outward: Object.values(outward), inward: Object.values(inward), outwardTotal: o, inwardTotal: i,
      outputTax: outTax, inputTax: inTax, netPayable: r2(outTax - inTax) };
  });
}

export async function outstanding(db, { kind = 'receivable', to = today() } = {}) {
  return withOrg(db, async (c) => {
    const code = kind === 'payable' ? 'sundry_creditors' : 'sundry_debtors';
    const { rows: g } = await c.query(
      `with recursive t as (select id from account_groups where code = $1
         union all select ag.id from account_groups ag join t on ag.parent_id = t.id) select id from t`, [code]);
    const ids = new Set(g.map((x) => x.id));
    const bal = (await ledgerBalances(c, { to })).filter((l) => ids.has(l.groupId) && r2(l.closing) !== 0);
    const list = bal.map((l) => ({ ledgerId: l.id, ledger: l.name,
      amount: r2(kind === 'payable' ? -l.closing : l.closing) })).sort((a, b) => b.amount - a.amount);
    return { kind, asOf: to, parties: list, total: r2(list.reduce((a, x) => a + x.amount, 0)) };
  });
}

export async function dashboard(db) {
  const t = today();
  const monthStart = `${t.slice(0, 8)}01`;
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `select type, coalesce(sum(total), 0) total, count(*)::int n from vouchers
        where status = 'posted' and date between $1 and $2 group by type`, [monthStart, t]);
    const { rows: todayRows } = await c.query(
      `select coalesce(sum(total) filter (where type = 'sales'), 0) sales,
              coalesce(sum(total) filter (where type = 'receipt'), 0) receipts, count(*)::int n
         from vouchers where status = 'posted' and date = $1`, [t]);
    const { rows: cash } = await c.query(
      `select coalesce(sum(l.opening_balance), 0) + coalesce((select sum(e.amount) from voucher_entries e
          join vouchers v on v.id = e.voucher_id and v.status = 'posted'
          join ledgers l2 on l2.id = e.ledger_id join account_groups g2 on g2.id = l2.group_id
         where g2.code in ('cash_in_hand', 'bank_accounts')), 0) as bal
         from ledgers l join account_groups g on g.id = l.group_id where g.code in ('cash_in_hand', 'bank_accounts')`);
    const items = await stockValuation(c, t);
    const month = Object.fromEntries(rows.map((r) => [r.type, { total: num(r.total), count: r.n }]));
    return {
      date: t, today: { sales: num(todayRows[0].sales), receipts: num(todayRows[0].receipts), vouchers: todayRows[0].n },
      month, cashAndBank: r2(num(cash[0].bal)), stockValue: r2(items.reduce((a, i) => a + i.value, 0)),
      lowStock: items.filter((i) => i.low).slice(0, 20),
    };
  });
}
