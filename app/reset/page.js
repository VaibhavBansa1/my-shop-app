'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { Field, ErrorNote } from '../ui/components.js';

// Token arrives in the URL fragment (#...), so it is not sent to the server in the page request or logged.
export default function Reset() {
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setToken(window.location.hash.slice(1)); history.replaceState(null, '', '/reset'); }, []);
  async function submit(e) {
    e.preventDefault(); setError(null);
    try { await api('/auth/password-reset/confirm', { method: 'POST', body: { token, newPassword: pw } }); setDone(true); } catch (err) { setError(err); }
  }
  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box">
        <form className="card grid" onSubmit={submit}>
          <h1>Choose a new password</h1>
          <ErrorNote error={error} />
          {done ? (<><div className="note note-ok">Password changed. For safety you have been signed out on all devices.</div>
            <Link className="btn btn-primary btn-block" href="/login">Sign in</Link></>) : !token ? (
            <div className="note note-error">This link is incomplete. Open the link from the email again, or <Link href="/forgot">ask for a new one</Link>.</div>
          ) : (<>
            <Field label="New password" hint="At least 10 characters."><input type="password" autoComplete="new-password" required minLength={10} maxLength={200} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <button className="btn btn-primary btn-block">Save new password</button>
          </>)}
        </form>
      </div>
    </div>
  );
}
