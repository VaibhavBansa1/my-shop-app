// Payment reminders to customers: prepare a message (WhatsApp / SMS links built from the shared
// template), send by email when the customer has one, and keep a record of every reminder.
import { withOrg } from '../db.js';
import { audit } from './audit.js';
import { ledgerStatement } from './reports.js';
import { sendEmail, emailConfigured } from '../email.js';
import { reserveAttempt } from '../auth/rate-limit.js';
import { normalizePhone, paymentReminder, smsUrl, whatsappUrl } from '../../shared/messages.js';
import { badRequest, notFound } from '../errors.js';
import { decryptField as dec } from '../crypto.js';

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export async function prepareReminder(db, ledgerId, { language = 'en' } = {}) {
  const info = await withOrg(db, async (c) => {
    const { rows } = await c.query(
      `select l.id, l.name, l.phone, l.email, g.code as group_code, pg.code as parent_code, o.name as shop, o.legal_name, o.upi_id
         from ledgers l join account_groups g on g.id = l.group_id left join account_groups pg on pg.id = g.parent_id
         join organizations o on o.id = l.org_id where l.id = $1`, [ledgerId]);
    if (!rows.length) throw notFound('Customer not found.');
    const last = await c.query(
      `select at, data->>'channel' as channel from audit_log where action = 'reminder.sent' and entity_id = $1 order by at desc limit 1`, [ledgerId]);
    return { ...rows[0], phone: dec(rows[0].phone), email: dec(rows[0].email), last: last.rows[0] ?? null };
  });
  if (![info.group_code, info.parent_code].includes('sundry_debtors')) throw badRequest('Reminders are for customers (Sundry Debtors).');
  const st = await ledgerStatement(db, ledgerId, {});
  const balance = st.closing;
  const phone = normalizePhone(info.phone);
  const message = paymentReminder({ language, shopName: info.legal_name || info.shop, customerName: info.name, amount: balance, upiId: info.upi_id, asOf: today() });
  return {
    ledgerId, name: info.name, shopName: info.legal_name || info.shop, balance, phone, email: info.email || null, message,
    whatsappUrl: whatsappUrl(phone, message), smsUrl: phone ? smsUrl(phone, message) : null,
    canEmail: Boolean(info.email) && emailConfigured(),
    lastReminder: info.last ? { at: info.last.at, channel: info.last.channel } : null,
  };
}

/** Record a reminder (WhatsApp/SMS/copy happen on the user's device) or send it by email. */
export async function sendReminder(db, ledgerId, { channel, language, message }) {
  const r = await prepareReminder(db, ledgerId, { language });
  if (r.balance <= 0) throw badRequest('This customer does not owe anything right now.');
  // Reserved before sending, so a burst of parallel clicks cannot send more than the limit (was O-05).
  const releaseOne = await reserveAttempt(`reminder:${db.orgId}:${ledgerId}`, { max: 3, windowSeconds: 86400 });
  let releaseAll;
  try { releaseAll = await reserveAttempt(`reminders:${db.orgId}`, { max: 200, windowSeconds: 86400 }); }
  catch (e) { await releaseOne(); throw e; }
  const text = message || r.message;
  try {
  if (channel === 'email') {
    if (!r.email) throw badRequest('This customer has no email address. Add it in the ledger, or use WhatsApp/SMS.');
    if (!emailConfigured()) throw badRequest('Email is not set up on this server. Use WhatsApp or SMS.');
    const sent = await sendEmail({ to: r.email, subject: `Payment reminder from ${r.shopName}`, text });
    if (!sent.ok) throw badRequest('The email could not be sent. Try WhatsApp or SMS.');
  }
  } catch (e) { await releaseOne(); await releaseAll(); throw e; }
  await withOrg(db, (c) => audit(c, db, 'reminder.sent', 'ledger', ledgerId, { channel, amount: r.balance }));
  return { ok: true, channel };
}
