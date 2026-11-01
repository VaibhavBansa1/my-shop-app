'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { ErrorNote, Loading } from '../ui/components.js';

// Token is in the URL fragment so it never reaches server logs.
export default function Verify() {
  const [state, setState] = useState('working');
  const [error, setError] = useState(null);
  useEffect(() => {
    const token = window.location.hash.slice(1);
    history.replaceState(null, '', '/verify');
    if (!token) { setState('error'); setError(new Error('This link is incomplete. Open the link from the email again.')); return; }
    api('/auth/verify-email/confirm', { method: 'POST', body: { token } })
      .then(() => setState('done')).catch((e) => { setState('error'); setError(e); });
  }, []);
  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box"><div className="card grid">
        <h1>Confirm your email</h1>
        {state === 'working' && <Loading />}
        {state === 'done' && (<><div className="note note-ok">Thank you — your email is confirmed.</div><Link className="btn btn-primary btn-block" href="/orgs">Continue</Link></>)}
        {state === 'error' && (<><ErrorNote error={error} /><Link className="btn btn-block" href="/orgs">Go to your account to resend it</Link></>)}
      </div></div>
    </div>
  );
}
