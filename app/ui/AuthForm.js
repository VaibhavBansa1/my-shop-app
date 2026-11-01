'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from './api.js';
import { Field, ErrorNote } from './components.js';

function safeNext() {
  if (typeof window === 'undefined') return '/orgs';
  const n = new URLSearchParams(window.location.search).get('next');
  // Only allow same-site relative paths (prevents open redirects).
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/orgs';
}

export default function AuthForm({ mode }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'signup') await api('/auth/signup', { method: 'POST', body: form });
      else await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
      window.location.href = safeNext();
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box">
        <form className="card grid" onSubmit={submit}>
          <div>
            <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
            <p className="muted">{mode === 'signup' ? 'Then set up your shop or join one you were invited to.' : 'Welcome back.'}</p>
          </div>
          <ErrorNote error={error} />
          {mode === 'signup' && (
            <Field label="Your name"><input autoComplete="name" required maxLength={120} value={form.name} onChange={set('name')} /></Field>
          )}
          <Field label="Email"><input type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={set('email')} /></Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters. A short sentence works well.' : undefined}>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required
              minLength={mode === 'signup' ? 10 : 1} maxLength={200} value={form.password} onChange={set('password')} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <p className="muted" style={{ textAlign: 'center' }}>
            {mode === 'signup'
              ? <>Have an account? <Link href={`/login${typeof window !== 'undefined' ? window.location.search : ''}`}>Sign in</Link></>
              : <>New here? <Link href={`/signup${typeof window !== 'undefined' ? window.location.search : ''}`}>Create an account</Link></>}
          </p>
        </form>
      </div>
    </div>
  );
}
