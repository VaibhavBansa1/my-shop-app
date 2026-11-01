'use client';
import { useState } from 'react';
import { api } from '../../../ui/api.js';
import { useApi, ErrorNote, PageHead, Field } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { date } from '../../../ui/format.js';
import { STATE_LIST } from '../../../ui/states.js';

export default function Settings() {
  const { org, can, reloadOrg } = useOrg();
  const editable = can('org.update');
  const [form, setForm] = useState({ name: org.name, legalName: org.legalName, gstin: org.gstin ?? '', stateCode: org.stateCode ?? '',
    address: org.address, phone: org.phone, email: org.email, fyStartMonth: org.fyStartMonth, booksFrom: org.booksFrom });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const ai = useApi(() => api('/ai/status'), []);
  const audit = useApi(() => (can('audit.read') ? api(`/orgs/${org.id}/audit`, { query: { limit: 50 } }) : Promise.resolve(null)), [org.id]);
  const set = (k) => (e) => {
    const v = e.target.value;
    if (k === 'gstin' && /^[0-9]{2}/.test(v.trim())) setForm({ ...form, gstin: v, stateCode: v.trim().slice(0, 2) });
    else setForm({ ...form, [k]: v });
  };

  async function run(fn, ok) { setError(null); setMsg(null); try { await fn(); setMsg(ok); } catch (e) { setError(e); } }

  return (
    <>
      <PageHead title="Settings" />
      <ErrorNote error={error} />
      {msg && <div className="note note-ok">{msg}</div>}
      <form className="card grid" onSubmit={(e) => { e.preventDefault(); run(async () => {
        await api(`/orgs/${org.id}`, { method: 'PATCH', body: { ...form, gstin: form.gstin.trim().toUpperCase(), fyStartMonth: Number(form.fyStartMonth) } }); reloadOrg();
      }, 'Business details saved.'); }}>
        <h2>Business details</h2>
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }} className="grid">
          <div className="grid grid-2">
            <Field label="Business name"><input required maxLength={120} value={form.name} onChange={set('name')} /></Field>
            <Field label="Legal name (on invoices)"><input maxLength={200} value={form.legalName} onChange={set('legalName')} /></Field>
            <Field label="GSTIN" hint="GST is charged on invoices only when this is set."><input maxLength={15} value={form.gstin} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} /></Field>
            <Field label="State"><select value={form.stateCode} onChange={set('stateCode')}><option value="">—</option>
              {STATE_LIST.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
            <Field label="Phone"><input maxLength={40} value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><input type="email" maxLength={254} value={form.email} onChange={set('email')} /></Field>
            <Field label="Financial year starts in"><select value={form.fyStartMonth} onChange={set('fyStartMonth')}>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
            <Field label="Books begin from"><input type="date" value={form.booksFrom} onChange={set('booksFrom')} /></Field>
          </div>
          <Field label="Address"><textarea maxLength={500} value={form.address} onChange={set('address')} /></Field>
          {editable && <div className="row"><button className="btn btn-primary">Save</button></div>}
        </fieldset>
      </form>

      <div className="card grid">
        <h2>AI assistant (optional)</h2>
        {!ai.data?.available ? (
          <p className="muted">AI is not set up on this server. The person who runs the server can connect Ollama or LM Studio on their own
            computer, or a cloud service (OpenRouter, Grok, OpenAI). See docs/AI.md.</p>
        ) : (<>
          <p>This server uses <b>{ai.data.provider}</b> ({ai.data.model}){ai.data.local ? ', running on your own computer/network — your data stays with you.' : ', a cloud service.'}</p>
          {!ai.data.local && <p className="note note-warn">Summaries send your shop's figures to {ai.data.provider}.
            {ai.data.sharesNames ? ' Customer, supplier and item names are included.' : ' Customer, supplier and item names are replaced with placeholders.'}</p>}
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" style={{ width: 20, minHeight: 20 }} disabled={!editable} checked={Boolean(org.aiEnabled)}
              onChange={(e) => run(async () => { await api(`/orgs/${org.id}`, { method: 'PATCH', body: { aiEnabled: e.target.checked } }); reloadOrg(); },
                e.target.checked ? 'AI summaries turned on. Find them on the Home page.' : 'AI summaries turned off.')} />
            <span>Turn on AI shop summaries for this business</span>
          </label>
        </>)}
      </div>

      <form className="card grid" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/auth/password', { method: 'POST', body: pw }); setPw({ currentPassword: '', newPassword: '' }); }, 'Password changed. Other devices were signed out.'); }}>
        <h2>Your password</h2>
        <div className="grid grid-2">
          <Field label="Current password"><input type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" hint="At least 10 characters"><input type="password" autoComplete="new-password" required minLength={10} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
        </div>
        <div className="row"><button className="btn">Change password</button>
          <span className="spacer" /><button type="button" className="btn btn-danger" onClick={async () => { await api('/auth/logout', { method: 'POST' }); window.location.href = '/'; }}>Sign out</button></div>
      </form>

      {audit.data && (
        <div className="card"><h2>Activity log</h2><div className="table-wrap"><table><tbody>{audit.data.entries.map((a) => (
          <tr key={a.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{date(a.at)}</td><td>{a.user_name ?? '—'}</td><td className="mono" style={{ fontSize: 13 }}>{a.action}</td></tr>
        ))}</tbody></table></div></div>
      )}

      {can('org.delete') && (
        <div className="card grid">
          <h2>Delete this business</h2>
          <p className="muted">This permanently deletes all of its vouchers, ledgers, items and members. It cannot be undone.</p>
          <Field label={`Type "${org.name}" to confirm`}><input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} /></Field>
          <div className="row"><button className="btn btn-danger" disabled={confirmName !== org.name}
            onClick={() => run(async () => { await api(`/orgs/${org.id}`, { method: 'DELETE', body: { confirmName } }); window.location.href = '/orgs'; }, '')}>Delete permanently</button></div>
        </div>
      )}
    </>
  );
}
