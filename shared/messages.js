// Customer-facing message templates and share links (WhatsApp, SMS). Pure JS: web + mobile.
const inr = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Normalise an Indian/international phone to digits with country code, or null. */
export function normalizePhone(raw, defaultCountry = '91') {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = defaultCountry + d.slice(1);
  else if (d.length === 10) d = defaultCountry + d;
  return /^\d{11,15}$/.test(d) ? d : null;
}

export function paymentReminder({ language = 'en', shopName, customerName, amount, upiId, asOf }) {
  const upi = upiId ? (language === 'hi' ? `\nUPI से भुगतान करें: ${upiId}` : `\nPay by UPI: ${upiId}`) : '';
  if (language === 'hi') {
    return `नमस्ते ${customerName} जी,\n${shopName} की ओर से याद दिलाना चाहते हैं कि ${asOf ? `${asOf} तक ` : ''}आपका बकाया ${inr(amount)} है।${upi}\nभुगतान हो चुका हो तो कृपया इस संदेश को अनदेखा करें। धन्यवाद!`;
  }
  if (language === 'hinglish') {
    return `Namaste ${customerName} ji,\n${shopName} se reminder: ${asOf ? `${asOf} tak ` : ''}aapka baaki ${inr(amount)} hai.${upi}\nAgar payment ho chuka hai to is message ko ignore karein. Dhanyavaad!`;
  }
  return `Hello ${customerName},\nThis is a friendly reminder from ${shopName}: your outstanding balance${asOf ? ` as on ${asOf}` : ''} is ${inr(amount)}.${upi}\nIf you have already paid, please ignore this message. Thank you!`;
}

export function invoiceMessage({ shopName, label, date, total, items = [] }) {
  const lines = items.slice(0, 10).map((i) => `• ${i.name} × ${i.qty} = ${inr(i.taxableValue)}`).join('\n');
  return `${shopName}\nBill ${label} dated ${date}\n${lines}${items.length > 10 ? '\n…' : ''}\nTotal: ${inr(total)}\nThank you for shopping with us!`;
}

export const whatsappUrl = (phone, text) => `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(text)}`;
export const smsUrl = (phone, text) => `sms:+${phone}?body=${encodeURIComponent(text)}`;

/** UPI ID format used by Indian payment apps, e.g. shopname@okhdfcbank */
export const UPI_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$/;
