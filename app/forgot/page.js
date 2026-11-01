'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { Field, ErrorNote } from '../ui/components.js';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault(); setError(null);
    try { setDone((await api('/auth/password-reset/request', { method: 'POST', body: { email } })).message); } catch (err) { setError(err); }
  }
  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box">
        <form className="card grid" onSubmit={submit}>
          <h1>Forgot your password?</h1>
          <p className="muted">Enter your email and we will send you a link to choose a new one.</p>
          <ErrorNote error={error} />
          {done ? <div className="note note-ok">{done} Check your inbox (and spam folder). The link works for 30 minutes.</div> : (<>
            <Field label="Email"><input type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <button className="btn btn-primary btn-block">Send reset link</button>
          </>)}
          <p className="muted" style={{ textAlign: 'center' }}><Link href="/login">Back to sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
