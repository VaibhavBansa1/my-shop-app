// In-app notifications (inbox per user per business) and the daily summary job.
import { withOrg, getPool } from '../db.js';
import { sendEmail } from '../email.js';
import { voucherNumberLabel } from './vouchers-label.js';

const inr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const ROLE_ORDER = ['viewer', 'cashier', 'accountant', 'admin', 'owner'];

/** Insert one notification for every member with at least `minRole` (inside the caller's transaction). */
export async function notifyMembers(c, { minRole = 'admin', exceptUserId = null, kind, title, body = '', link = null }) {
  const roles = ROLE_ORDER.slice(ROLE_ORDER.indexOf(minRole));
  await c.query(
    `insert into notifications (org_id, user_id, kind, title, body, link)
     select m.org_id, m.user_id, $1, left($2, 200), left($3, 2000), $4 from memberships m
      where m.org_id = app_org_id() and m.role = any($5::org_role[]) and m.user_id is distinct from $6`,
    [kind, title, body, link, roles, exceptUserId]);
}

export async function listNotifications(db, { unreadOnly = false, limit = 50 } = {}) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      `select id, kind, title, body, link, created_at, read_at from notifications
        where org_id = app_org_id() and user_id = app_user_id() and ($1 = false or read_at is null)
        order by created_at desc limit $2`, [unreadOnly, Math.min(limit, 200)]);
    const { rows: cnt } = await c.query('select count(*)::int n from notifications where org_id = app_org_id() and user_id = app_user_id() and read_at is null');
    return { unread: cnt[0].n, notifications: rows.map((r) => ({ id: Number(r.id), kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, read: Boolean(r.read_at) })) };
  });
}

export async function markRead(db, { ids, all }) {
  return withOrg(db, async (c) => {
    const r = all
      ? await c.query('update notifications set read_at = now() where org_id = app_org_id() and user_id = app_user_id() and read_at is null')
      : await c.query('update notifications set read_at = now() where org_id = app_org_id() and user_id = app_user_id() and read_at is null and id = any($1::bigint[])', [ids ?? []]);
    return { marked: r.rowCount };
  });
}

export async function getSettings(db) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query('select notify_email from memberships where org_id = app_org_id() and user_id = app_user_id()');
    return { notifyEmail: Boolean(rows[0]?.notify_email) };
  });
}
export async function updateSettings(db, { notifyEmail }) {
  return withOrg(db, async (c) => {
    await c.query('update memberships set notify_email = $1 where org_id = app_org_id() and user_id = app_user_id()', [notifyEmail]);
    return { notifyEmail };
  });
}

/** After a stock-out voucher: alert when an item crosses its reorder level because of this voucher. */
export async function lowStockAlerts(c, db, voucherId) {
  const { rows } = await c.query(
    `with moved as (select stock_item_id, sum(stock_qty) as delta from voucher_items where voucher_id = $1 group by stock_item_id),
          now_qty as (
            select i.id, i.name, i.reorder_level, u.symbol, m.delta,
                   i.opening_qty + coalesce((select sum(vi.stock_qty) from voucher_items vi join vouchers v on v.id = vi.voucher_id
                                               where vi.stock_item_id = i.id and v.status = 'posted'), 0) as qty
              from moved m join stock_items i on i.id = m.stock_item_id join units u on u.id = i.unit_id where m.delta < 0)
     select * from now_qty where qty <= reorder_level and qty - delta > reorder_level`, [voucherId]);
  for (const r of rows) {
    await notifyMembers(c, { minRole: 'accountant', kind: 'low_stock', title: `Low stock: ${r.name}`,
      body: `${Number(r.qty)} ${r.symbol} left (reorder level ${Number(r.reorder_level)}).`, link: '/items' });
  }
  return rows.length;
}

export async function cancelledAlert(c, db, v, reason) {
  const { rows } = await c.query('select name from users where id = $1', [db.userId]);
  await notifyMembers(c, { minRole: 'admin', exceptUserId: db.userId, kind: 'voucher_cancelled',
    title: `${voucherNumberLabel(v.type, v.fy_start, v.number)} cancelled by ${rows[0]?.name ?? 'someone'}`,
    body: `${inr(v.total)} · Reason: ${reason}`, link: `/vouchers/${v.id}` });
}

// ---------------- daily summary job ----------------
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

export async function dailySummaryForOrg(orgId, ownerId, { day = ymd(new Date(Date.now() - 86400000)), origin = '' } = {}) {
  const db = { userId: ownerId, orgId };
  return withOrg(db, async (c) => {
    const { rows: [org] } = await c.query('select name from organizations where id = $1', [orgId]);
    const { rows: [t] } = await c.query(
      `select coalesce(sum(total) filter (where type = 'sales'), 0) sales, count(*) filter (where type = 'sales')::int bills,
              coalesce(sum(total) filter (where type = 'receipt'), 0) receipts, coalesce(sum(total) filter (where type = 'payment'), 0) payments,
              count(*) filter (where status = 'cancelled')::int cancelled
         from vouchers where date = $1 and (status = 'posted' or (status = 'cancelled' and cancelled_at::date = $1))`, [day]);
    const { rows: [due] } = await c.query(
      `select coalesce(sum(l.opening_balance), 0) + coalesce((select sum(e.amount) from voucher_entries e join vouchers v on v.id = e.voucher_id and v.status = 'posted'
          join ledgers l2 on l2.id = e.ledger_id join account_groups g2 on g2.id = l2.group_id where g2.code = 'sundry_debtors'), 0) as total
         from ledgers l join account_groups g on g.id = l.group_id where g.code = 'sundry_debtors'`);
    const { rows: low } = await c.query(
      `select count(*)::int n from stock_items i where i.is_active and i.reorder_level > 0 and
         i.opening_qty + coalesce((select sum(vi.stock_qty) from voucher_items vi join vouchers v on v.id = vi.voucher_id where vi.stock_item_id = i.id and v.status = 'posted'), 0) <= i.reorder_level`);
    if (Number(t.sales) === 0 && Number(t.receipts) === 0 && Number(t.payments) === 0 && low[0].n === 0 && Number(due.total) <= 0) return { skipped: true };
    const title = `${day}: sales ${inr(t.sales)} (${t.bills} bills)`;
    const body = [`Receipts ${inr(t.receipts)}, payments ${inr(t.payments)}.`,
      Number(due.total) > 0 ? `Customers owe ${inr(due.total)} in total.` : null,
      low[0].n ? `${low[0].n} item(s) at or below reorder level.` : null,
      t.cancelled ? `${t.cancelled} voucher(s) cancelled.` : null].filter(Boolean).join(' ');
    await notifyMembers(c, { minRole: 'accountant', kind: 'daily_summary', title, body, link: '/reports' });
    const { rows: recipients } = await c.query(
      `select u.email, u.name from memberships m join users u on u.id = m.user_id
        where m.org_id = app_org_id() and m.notify_email and m.role in ('accountant', 'admin', 'owner')`);
    for (const r of recipients) {
      await sendEmail({ to: r.email, subject: `${org.name} — ${title}`, text: `Hello ${r.name},\n\n${org.name}, ${day}:\n${body}\n\n${origin ? `Open: ${origin}/o/${orgId}\n\n` : ''}You can turn these emails off in Settings → Notifications.\n` });
    }
    return { skipped: false, emailed: recipients.length };
  });
}

export async function runDailySummaries(opts = {}) {
  const { rows } = await getPool().query('select * from job_org_owners()');
  let sent = 0;
  for (const r of rows) {
    try { if (!(await dailySummaryForOrg(r.org_id, r.owner_id, opts)).skipped) sent++; }
    catch (e) { console.error(JSON.stringify({ level: 'error', msg: 'daily summary failed', orgId: r.org_id, error: e.message })); }
  }
  await getPool().query('select purge_old_notifications()');
  return { organizations: rows.length, sent };
}
