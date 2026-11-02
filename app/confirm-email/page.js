'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { ErrorNote, Loading } from '../ui/components.js';

// Token is in the URL fragment so it never reaches server logs; removed from the address bar at once.
export default function ConfirmEmail() {
  const [state, setState] = useState('working');
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  useEffect(() => {
    const token = window.location.hash.slice(1);
    history.replaceState(null, '', '/confirm-email');
    if (!token) { setState('error'); setError(new Error('This link is incomplete. Open the link from the email again.')); return; }
    api('/auth/email-change/confirm', { method: 'POST', body: { token } })
      .then((r) => { setEmail(r.email); setState('done'); }).catch((e) => { setState('error'); setError(e); });
  }, []);
  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box"><div className="card grid">
        <h1>Confirm your new email</h1>
        {state === 'working' && <Loading />}
        {state === 'done' && (<><div className="note note-ok">Done. Your account now signs in with <b>{email}</b>. For safety, every device was signed out.</div>
          <Link className="btn btn-primary btn-block" href="/login">Sign in</Link></>)}
        {state === 'error' && (<><ErrorNote error={error} /><Link className="btn btn-block" href="/login">Go to sign in</Link></>)}
      </div></div>
    </div>
  );
}
