'use client';
// Settings card: your name, your sign-in email (confirmed by link), and deleting your account.
import { useState } from 'react';
import { api } from './api.js';
import { useApi, ErrorNote, Field } from './components.js';

export default function AccountCard() {
  const me = useApi(() => api('/me'), []);
  const [name, setName] = useState(null);
  const [em, setEm] = useState({ newEmail: '', password: '', code: '' });
  const [del, setDel] = useState({ password: '', code: '', confirm: '' });
  const [open, setOpen] = useState(null);         // 'email' | 'delete'
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const run = async (fn, ok) => { setError(null); setMsg(null); try { await fn(); setMsg(ok); } catch (e) { setError(e); } };
  const u = me.data?.user;
  if (!u) return null;
  const needsCode = Boolean(u.mfa);
  return (
    <div className="card grid" id="account">
      <h2>Your account</h2>
      <ErrorNote error={error} />{msg && <div className="note note-ok">{msg}</div>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/me', { method: 'PATCH', body: { name: name ?? u.name } }); me.reload(); }, 'Name saved.'); }}>
        <div style={{ flex: 1, minWidth: 220 }}><Field label="Your name"><input required maxLength={120} value={name ?? u.name} onChange={(e) => setName(e.target.value)} /></Field></div>
        <button className="btn" style={{ alignSelf: 'flex-end' }}>Save name</button>
      </form>
      <p>Sign-in email: <b>{u.email}</b> {open !== 'email' && <button type="button" className="btn btn-sm" onClick={() => setOpen('email')}>Change</button>}</p>
      {open === 'email' && (
        <form className="grid" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/me/email', { method: 'POST', body: { ...em, code: em.code || undefined } }); setOpen(null); setEm({ newEmail: '', password: '', code: '' }); },
          'Check the new inbox for a confirmation link (valid 24 hours). Your current email also gets a notice. Nothing changes until the link is opened.'); }}>
          <div className="grid grid-3">
            <Field label="New email"><input type="email" required maxLength={254} value={em.newEmail} onChange={(e) => setEm({ ...em, newEmail: e.target.value })} /></Field>
            <Field label="Your password"><input type="password" autoComplete="current-password" required value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} /></Field>
            {needsCode && <Field label="Two-step code"><input autoComplete="one-time-code" required maxLength={20} value={em.code} onChange={(e) => setEm({ ...em, code: e.target.value })} /></Field>}
          </div>
          <div className="row"><button className="btn btn-primary">Send confirmation link</button><button type="button" className="btn" onClick={() => setOpen(null)}>Cancel</button></div>
        </form>
      )}
      <details open={open === 'delete'} onToggle={(e) => setOpen(e.currentTarget.open ? 'delete' : null)}>
        <summary className="muted">Delete my account</summary>
        <div className="grid" style={{ marginTop: 10 }}>
          <p className="muted">Your name, email, password and two-step login are wiped and you are signed out everywhere. Bills you entered stay in
            the books of the businesses (accounting records must be kept) and show "Deleted user". This cannot be undone.</p>
          {me.data.blocksDeletion?.length > 0 && <div className="note note-warn">First delete these businesses or make someone else an owner: {me.data.blocksDeletion.map((b) => b.name).join(', ')}.</div>}
          <form className="grid" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/me', { method: 'DELETE', body: { ...del, code: del.code || undefined } }); window.location.href = '/'; }, 'Account deleted.'); }}>
            <div className="grid grid-3">
              <Field label="Your password"><input type="password" autoComplete="current-password" required value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></Field>
              {needsCode && <Field label="Two-step code"><input autoComplete="one-time-code" required maxLength={20} value={del.code} onChange={(e) => setDel({ ...del, code: e.target.value })} /></Field>}
              <Field label='Type "DELETE" to confirm'><input required value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} /></Field>
            </div>
            <div className="row"><button className="btn btn-danger" disabled={del.confirm !== 'DELETE' || me.data.blocksDeletion?.length > 0}>Delete my account</button></div>
          </form>
        </div>
      </details>
    </div>
  );
}
