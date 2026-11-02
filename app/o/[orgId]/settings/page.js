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
  const [form, setForm] = useState({ name: org.name, legalName: org.legalName, gstin: org.gstin ?? '', stateCode: org.stateCode ?? '', upiId: org.upiId ?? '',
    address: org.address, phone: org.phone, email: org.email, fyStartMonth: org.fyStartMonth, booksFrom: org.booksFrom });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const ai = useApi(() => api('/ai/status'), []);
  const notify = useApi(() => api(`/orgs/${org.id}/notification-settings`), [org.id]);
  const sessions = useApi(() => api('/me/sessions'), []);
  const secEvents = useApi(() => api('/me/security-events'), []);
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
            <Field label="UPI ID (optional)" hint="Added to payment reminders so customers can pay instantly, e.g. shopname@okhdfcbank"><input maxLength={130} value={form.upiId} onChange={set('upiId')} autoCapitalize="none" /></Field>
          </div>
          <Field label="Address"><textarea maxLength={500} value={form.address} onChange={set('address')} /></Field>
          {editable && <div className="row"><button className="btn btn-primary">Save</button></div>}
        </fieldset>
      </form>

      <div className="card grid" id="notifications">
        <h2>Notifications</h2>
        <p className="muted">In the app (🔔): cancelled bills and new members for owners/admins; low stock and the daily summary for accountants and above.</p>
        <label className="row" style={{ gap: 10 }}>
          <input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={Boolean(notify.data?.notifyEmail)} disabled={!notify.data}
            onChange={(e) => run(async () => { await api(`/orgs/${org.id}/notification-settings`, { method: 'PATCH', body: { notifyEmail: e.target.checked } }); notify.reload(); },
              e.target.checked ? 'You will get the daily summary by email.' : 'Daily summary emails turned off.')} />
          <span>Email me the daily summary for this business</span>
        </label>
      </div>

      <div className="card grid">
        <h2>AI assistant (optional)</h2>
        {!ai.data?.available ? (
          <p className="muted">AI is not set up on this server. The person who runs the server can connect Ollama or LM Studio on their own
            computer, or a cloud service (Groq, OpenRouter, Grok, OpenAI). See docs/AI.md.</p>
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

      <div className="card grid" id="security">
        <h2>Security — your devices and sign-ins</h2>
        <p className="muted">Places where you are signed in. If you don't recognise one, sign it out and change your password.</p>
        <div className="table-wrap"><table><tbody>{sessions.data?.sessions.map((x) => (
          <tr key={x.id}><td>{(x.device || 'Unknown device').slice(0, 80)}{x.current && <> <span className="badge">this device</span></>}
            <div className="muted" style={{ fontSize: 12 }}>{x.ip && x.ip !== 'unknown' ? `${x.ip} · ` : ''}last active {new Date(x.lastSeenAt).toLocaleString('en-IN')}</div></td>
            <td className="num">{!x.current && <button className="btn btn-sm" onClick={() => run(async () => { await api(`/me/sessions/${x.id}`, { method: 'DELETE' }); sessions.reload(); }, 'Device signed out.')}>Sign out</button>}</td></tr>
        ))}</tbody></table></div>
        {sessions.data?.sessions.length > 1 && <div className="row"><button className="btn btn-sm btn-danger"
          onClick={() => run(async () => { await api('/me/sessions', { method: 'DELETE' }); sessions.reload(); }, 'Signed out of all other devices.')}>Sign out all other devices</button></div>}
        <details><summary className="muted">Recent sign-in activity</summary>
          <div className="table-wrap"><table><tbody>{secEvents.data?.events.map((e, i) => (
            <tr key={i}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('en-IN')}</td>
              <td>{EVENT_LABEL[e.event] ?? e.event}</td><td className="muted" style={{ fontSize: 13 }}>{e.ip && e.ip !== 'unknown' ? e.ip : ''}</td></tr>
          ))}</tbody></table></div>
        </details>
      </div>

      {audit.data && (
        <div className="card"><h2>Activity log</h2><div className="table-wrap"><table><tbody>{audit.data.entries.map((a) => (
          <tr key={a.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{date(a.at)}</td><td>{a.user_name ?? '—'}</td><td className="mono" style={{ fontSize: 13 }}>{a.action}</td></tr>
        ))}</tbody></table></div></div>
      )}

      {editable && (
        <div className="card grid">
          <h2>Backup</h2>
          <p className="muted">Download everything in this business (ledgers, items, vouchers, members) as one JSON file. Keep it somewhere safe.</p>
          <div className="row"><a className="btn" href={`/api/v1/orgs/${org.id}/export`} download>Download backup</a></div>
        </div>
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

const EVENT_LABEL = {
  'login.success': 'Signed in', 'login.failure': 'Wrong password tried', 'login.throttled': 'Sign-in blocked (too many tries)',
  signup: 'Account created', logout: 'Signed out', 'password.changed': 'Password changed', 'password.reset_requested': 'Password reset asked',
  'password.reset_done': 'Password reset', 'email.verified': 'Email confirmed', 'session.revoked': 'A device was signed out',
  'sessions.revoked_all': 'All other devices signed out', 'access.denied': 'Blocked: no permission', 'rate.limited': 'Slowed down (too many requests)',
  'auth.rejected': 'Expired or invalid sign-in', 'export.downloaded': 'Backup downloaded', 'member.role_changed': 'Changed a member\'s role',
  'member.removed': 'Removed a member', 'org.deleted': 'Deleted a business',
};
