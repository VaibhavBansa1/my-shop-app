// Outgoing email. Provider is chosen by environment:
//   RESEND_API_KEY + EMAIL_FROM  -> sends via Resend's HTTPS API (no extra dependency)
//   otherwise (development)       -> writes the message to the server log
// In production without a provider, messages are not delivered and a warning is logged.
const sent = []; // last messages, for tests only

export async function sendEmail({ to, subject, text }) {
  const msg = { to, subject, text };
  if (process.env.NODE_ENV === 'test' || process.env.EMAIL_CAPTURE === '1') { sent.push(msg); return { ok: true, captured: true }; }
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      console.error(JSON.stringify({ level: 'error', msg: 'email send failed', status: res.status }));
      return { ok: false };
    }
    return { ok: true };
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn(JSON.stringify({ level: 'warn', msg: 'email provider not configured; message not sent', subject }));
    return { ok: false };
  }
  console.log(`\n--- email (dev) to ${to}: ${subject}\n${text}\n---\n`);
  return { ok: true, logged: true };
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export function takeSentEmails() { return sent.splice(0, sent.length); }
