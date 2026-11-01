// Outgoing email with pluggable providers, chosen by EMAIL_PROVIDER (or auto-detected):
//   smtp    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE  (Gmail, Zoho, Brevo, SES SMTP, Mailpit…)
//   resend  RESEND_API_KEY                                          (HTTPS API, no SMTP needed)
//   log     print messages to the server log (default in development)
//   none    do not send (default in production when nothing is configured; a warning is logged)
// EMAIL_FROM is the sender, e.g. "My Shop <no-reply@your-domain.in>".
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const captured = [];
let smtpTransport = null;

export function emailProvider() {
  if (process.env.EMAIL_CAPTURE === '1') return 'capture';
  const p = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (['smtp', 'resend', 'log', 'none'].includes(p)) return p;
  if (process.env.SMTP_HOST) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return process.env.NODE_ENV === 'production' ? 'none' : 'log';
}

export const emailConfigured = () => ['smtp', 'resend', 'capture'].includes(emailProvider());
const from = () => process.env.EMAIL_FROM || 'My Shop <no-reply@localhost>';

function smtp() {
  if (!smtpTransport) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      // Never send credentials over plain text to a remote server: require STARTTLS unless it's a local catcher.
      requireTLS: !['localhost', '127.0.0.1', 'mailpit'].includes(process.env.SMTP_HOST) && port !== 465,
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
  }
  return smtpTransport;
}

/** Send a message. Never throws: email problems must not break sign-up or invitations. */
export async function sendEmail({ to, subject, text, html }) {
  const provider = emailProvider();
  try {
    if (provider === 'capture') { captured.push({ to, subject, text, html }); return { ok: true }; }
    if (provider === 'smtp') {
      await smtp().sendMail({ from: from(), to, subject, text, html });
      return { ok: true };
    }
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from(), to: [to], subject, text, html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`resend status ${res.status}`);
      return { ok: true };
    }
    if (provider === 'log') {
      console.log(`\n--- email (${provider}) to ${to}: ${subject}\n${text}\n---\n`);
      return { ok: true, logged: true };
    }
    console.warn(JSON.stringify({ level: 'warn', msg: 'email not configured; message not sent', subject }));
    return { ok: false };
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'email send failed', provider, error: e.message }));
    return { ok: false };
  }
}

export function takeSentEmails() { return captured.splice(0, captured.length); }
