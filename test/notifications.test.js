import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, uniqueEmail } from './helpers.js';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
before(setupDb);
after(closePool);

async function team() {
  const A = await import('../lib/services/accounts.js');
  const O = await import('../lib/services/orgs.js');
  const owner = await makeUserOrg();
  const members = {};
  for (const role of ['admin', 'accountant', 'cashier']) {
    const email = uniqueEmail(role);
    const inv = await O.inviteMember(owner.db, 'owner', { email, role });
    const { user } = await A.signup({ name: `The ${role}`, email, password: 'notify tester pass' }, { ip: `n-${role}` });
    await O.acceptInvitation(user.id, inv.token);
    members[role] = { userId: user.id, orgId: owner.org.id, email };
  }
  return { owner, members };
}

test('member joins, bill cancelled and low stock reach the right people only', async () => {
  const N = await import('../lib/services/notifications.js');
  const m = await import('../lib/services/masters.js');
  const { createVoucher, cancelVoucher } = await import('../lib/services/vouchers.js');
  const { owner, members } = await team();
  const outsider = await makeUserOrg();

  let inbox = await N.listNotifications(owner.db);
  assert.equal(inbox.notifications.filter((n) => n.kind === 'member_joined').length, 3, 'owner told about 3 joins');
  assert.equal((await N.listNotifications(members.cashier)).notifications.length, 0, 'cashier gets no join alerts');

  const pcs = (await m.listUnits(owner.db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(owner.db, { name: 'Detergent', unitId: pcs, salePrice: 90, openingQty: 12, openingRate: 70, reorderLevel: 5 });
  const today = new Date().toISOString().slice(0, 10);
  const sale = (qty) => createVoucher(members.cashier, { type: 'sales', date: today, reference: '', narration: '', items: [{ stockItemId: item.id, qty, rate: 90 }], entries: [] });
  await sale(5); // 12 -> 7, still above 5
  assert.equal((await N.listNotifications(members.accountant)).notifications.filter((n) => n.kind === 'low_stock').length, 0);
  const v = await sale(3); // 7 -> 4, crosses the reorder level
  await sale(1); // 4 -> 3, already low: no repeat alert
  const accInbox = await N.listNotifications(members.accountant);
  const low = accInbox.notifications.filter((n) => n.kind === 'low_stock');
  assert.equal(low.length, 1);
  assert.match(low[0].title, /Low stock: Detergent/);
  assert.match(low[0].body, /4 pcs left/);
  assert.equal((await N.listNotifications(members.cashier)).notifications.filter((n) => n.kind === 'low_stock').length, 0, 'cashier not alerted');

  await cancelVoucher(members.accountant, v.id, 'customer returned it');
  inbox = await N.listNotifications(owner.db);
  const c = inbox.notifications.find((n) => n.kind === 'voucher_cancelled');
  assert.match(c.title, /INV\/\d\d-\d\d\/2 cancelled by The accountant/);
  assert.match(c.body, /customer returned it/);
  assert.equal(c.link, `/vouchers/${v.id}`);
  assert.ok((await N.listNotifications(members.admin)).notifications.some((n) => n.kind === 'voucher_cancelled'));
  assert.ok(!(await N.listNotifications(members.accountant)).notifications.some((n) => n.kind === 'voucher_cancelled'), 'actor is not notified about own action');
  assert.equal((await N.listNotifications(outsider.db)).notifications.length, 0, 'other businesses see nothing');

  // Marking read affects only my own inbox.
  const before = (await N.listNotifications(members.admin)).unread;
  await N.markRead(owner.db, { all: true });
  assert.equal((await N.listNotifications(owner.db)).unread, 0);
  assert.equal((await N.listNotifications(members.admin)).unread, before);
  const one = (await N.listNotifications(members.admin)).notifications[0];
  await N.markRead(members.admin, { ids: [one.id] });
  assert.equal((await N.listNotifications(members.admin)).unread, before - 1);
});

test('notifications are private even with raw SQL as the app role', async () => {
  const { withOrg } = await import('../lib/db.js');
  const { owner, members } = await team();
  const mine = await withOrg(members.cashier, (c) => c.query('select count(*)::int n from notifications'));
  assert.equal(mine.rows[0].n, 0, "cashier cannot read the owner's notifications");
  await assert.rejects(withOrg(members.cashier, (c) => c.query('delete from notifications')), /permission denied/);
  await assert.rejects(withOrg(members.cashier, (c) => c.query("update notifications set title = 'x'")), /permission denied/);
  await assert.rejects(withOrg(members.cashier, (c) => c.query(
    "insert into notifications (org_id, user_id, kind, title, link) values ($1, $2, 'low_stock', 'x', 'https://evil.example')", [owner.org.id, owner.user.id])), /check constraint/);
});

test('daily summary: in-app for accountants+, email only for those who opted in', async () => {
  const N = await import('../lib/services/notifications.js');
  const m = await import('../lib/services/masters.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const { owner, members } = await team();
  const pcs = (await m.listUnits(owner.db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(owner.db, { name: 'Pen', unitId: pcs, salePrice: 10, openingQty: 100, openingRate: 5 });
  const y = new Date(Date.now() - 86400000); const day = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const { updateOrg } = await import('../lib/services/orgs.js');
  await updateOrg(owner.db, { booksFrom: day });
  await createVoucher(owner.db, { type: 'sales', date: day, reference: '', narration: '', items: [{ stockItemId: item.id, qty: 3, rate: 10 }], entries: [] });
  await N.updateSettings(members.admin, { notifyEmail: true });
  assert.deepEqual(await N.getSettings(members.admin), { notifyEmail: true });
  takeSentEmails();
  const r = await N.dailySummaryForOrg(owner.org.id, owner.user.id, { day, origin: 'https://shop.example' });
  assert.equal(r.skipped, false);
  const sum = (await N.listNotifications(members.accountant)).notifications.find((n) => n.kind === 'daily_summary');
  assert.match(sum.title, /sales ₹30 \(1 bills\)/);
  assert.ok(!(await N.listNotifications(members.cashier)).notifications.some((n) => n.kind === 'daily_summary'));
  const mails = takeSentEmails();
  assert.deepEqual(mails.map((x) => x.to), [members.admin.email]);
  const all = await N.runDailySummaries({ day: '2001-01-01' });
  assert.ok(all.organizations >= 1);
});

test('payment reminders: message, links, email, limits and audit', async () => {
  const R = await import('../lib/services/reminders.js');
  const m = await import('../lib/services/masters.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { updateOrg } = await import('../lib/services/orgs.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const { owner, members } = await team();
  await updateOrg(owner.db, { upiId: 'bansalstore@okhdfcbank' });
  await assert.rejects(updateOrg(owner.db, { upiId: 'not a upi' }));
  const groups = await m.listGroups(owner.db);
  const cust = await m.createLedger(owner.db, { name: 'Ramesh Traders', groupId: groups.find((g) => g.code === 'sundry_debtors').id, phone: '98765 43210', email: 'ramesh@example.com', stateCode: '23' });
  const pcs = (await m.listUnits(owner.db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(owner.db, { name: 'Rice', unitId: pcs, salePrice: 500, openingQty: 10, openingRate: 400 });
  await createVoucher(owner.db, { type: 'sales', date: new Date().toISOString().slice(0, 10), partyLedgerId: cust.id, reference: '', narration: '', items: [{ stockItemId: item.id, qty: 2, rate: 500 }], entries: [] });

  const p = await R.prepareReminder(members.cashier, cust.id, { language: 'en' });
  assert.equal(p.balance, 1000);
  assert.equal(p.phone, '919876543210');
  assert.match(p.message, /Ramesh Traders/);
  assert.match(p.message, /₹1,000\.00/);
  assert.match(p.message, /Pay by UPI: bansalstore@okhdfcbank/);
  assert.ok(p.whatsappUrl.startsWith('https://wa.me/919876543210?text='));
  assert.ok(p.smsUrl.startsWith('sms:+919876543210?body='));
  const hi = await R.prepareReminder(members.cashier, cust.id, { language: 'hi' });
  assert.match(hi.message, /बकाया ₹1,000\.00/);

  takeSentEmails();
  await R.sendReminder(members.cashier, cust.id, { channel: 'email', language: 'en' });
  const [mail] = takeSentEmails();
  assert.equal(mail.to, 'ramesh@example.com');
  assert.match(mail.subject, /Payment reminder from/);
  await R.sendReminder(members.cashier, cust.id, { channel: 'whatsapp', language: 'hi' });
  assert.equal((await R.prepareReminder(owner.db, cust.id)).lastReminder.channel, 'whatsapp');
  await R.sendReminder(members.cashier, cust.id, { channel: 'sms' });
  await assert.rejects(R.sendReminder(members.cashier, cust.id, { channel: 'sms' }), /Too many/, 'max 3 reminders per customer per day');

  const cash = (await m.listLedgers(owner.db)).find((l) => l.code === 'cash');
  await assert.rejects(R.prepareReminder(owner.db, cash.id), /customers/);
  const settled = await m.createLedger(owner.db, { name: 'Paid Up', groupId: groups.find((g) => g.code === 'sundry_debtors').id });
  await assert.rejects(R.sendReminder(owner.db, settled.id, { channel: 'whatsapp' }), /does not owe/);
});
