'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead } from '../../../../ui/components.js';
import { useOrg } from '../../../../ui/OrgContext.js';
import { money, date } from '../../../../ui/format.js';
import { smsUrl, whatsappUrl } from '../../../../../shared/messages.js';

export default function Remind({ params }) {
  const { ledgerId } = use(params);
  const { org, base } = useOrg();
  const [language, setLanguage] = useState('en');
  const r = useApi(() => api(`/orgs/${org.id}/reminders/${ledgerId}`, { query: { language } }), [org.id, ledgerId, language]);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (r.data) setMessage(r.data.message); }, [r.data]);

  async function record(channel) {
    setError(null);
    try {
      await api(`/orgs/${org.id}/reminders/${ledgerId}`, { method: 'POST', body: { channel, language, message } });
      setDone(channel === 'email' ? 'Email sent.' : 'Reminder recorded.');
      r.reload();
    } catch (e) { setError(e); }
  }
  function openLink(url, channel) { window.open(url, '_blank', 'noopener'); record(channel); }

  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorNote error={r.error} />;
  const d = r.data;
  return (
    <>
      <PageHead title={`Payment reminder — ${d.name}`} sub={`Owes ${money(d.balance)}`}
        actions={<Link className="btn" href={`${base}/ledgers/${ledgerId}`}>Ledger</Link>} />
      {d.balance <= 0 && <div className="note note-ok">This customer does not owe anything right now.</div>}
      {d.lastReminder && <p className="muted">Last reminded {date(d.lastReminder.at)} by {d.lastReminder.channel}.</p>}
      <div className="card grid">
        <div className="chips">{[['en', 'English'], ['hi', 'हिन्दी'], ['hinglish', 'Hinglish']].map(([k, l]) =>
          <button key={k} className={`chip ${language === k ? 'active' : ''}`} onClick={() => setLanguage(k)}>{l}</button>)}</div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={7} aria-label="Message" />
        {!org.upiId && <p className="muted" style={{ fontSize: 13 }}>Tip: add your UPI ID in Settings and it will be included so customers can pay instantly.</p>}
        <ErrorNote error={error} />
        {done && <div className="note note-ok">{done}</div>}
        <div className="row">
          <button className="btn btn-primary" disabled={d.balance <= 0} onClick={() => openLink(whatsappUrl(d.phone, message), 'whatsapp')}>WhatsApp{d.phone ? '' : ' (choose contact)'}</button>
          {d.phone && <button className="btn" disabled={d.balance <= 0} onClick={() => openLink(smsUrl(d.phone, message), 'sms')}>SMS</button>}
          {d.canEmail && <button className="btn" disabled={d.balance <= 0} onClick={() => record('email')}>Email to {d.email}</button>}
          <button className="btn" disabled={d.balance <= 0} onClick={async () => { await navigator.clipboard?.writeText(message); record('copy'); }}>Copy text</button>
        </div>
        {!d.phone && <p className="muted" style={{ fontSize: 13 }}>No phone number saved for this customer. Add it in Parties &amp; ledgers to send directly.</p>}
      </div>
    </>
  );
}
