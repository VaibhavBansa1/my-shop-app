'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { ErrorNote, Loading } from '../ui/components.js';
import { ROLE_LABEL } from '../ui/format.js';

// The token travels in the URL fragment (#...), so it is never sent to servers or logged.
export default function InvitePage() {
  const [token, setToken] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    const t = window.location.hash.slice(1);
    if (t) sessionStorage.setItem('invite', t);
    const tok = t || sessionStorage.getItem('invite');
    setToken(tok);
    if (!tok) { setError(new Error('This invitation link is incomplete.')); return; }
    fetch(`/api/v1/invitations/accept?token=${encodeURIComponent(tok)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        if (r.status === 401) { setNeedLogin(true); return; }
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error?.message || 'Invitation not found.');
        setInfo(d);
      }).catch(setError);
  }, []);

  async function accept() {
    try {
      const r = await api('/invitations/accept', { method: 'POST', body: { token } });
      sessionStorage.removeItem('invite');
      window.location.href = `/o/${r.orgId}`;
    } catch (e) { setError(e); }
  }

  return (
    <div className="public">
      <header className="public-top"><Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link></header>
      <div className="auth-box"><div className="card grid">
        <h1>Join a business</h1>
        <ErrorNote error={error} />
        {needLogin && (<>
          <p>Sign in or create an account with the email address the invitation was sent to.</p>
          <div className="row"><Link className="btn btn-primary" href="/login?next=/invite">Sign in</Link>
            <Link className="btn" href="/signup?next=/invite">Create account</Link></div>
        </>)}
        {!needLogin && !info && !error && <Loading />}
        {info && (<>
          <p>You have been invited to <b>{info.orgName}</b> as <b>{ROLE_LABEL[info.role]}</b>.</p>
          <p className="muted">Invitation for {info.email}</p>
          <button className="btn btn-primary btn-block" onClick={accept}>Accept and open</button>
        </>)}
      </div></div>
    </div>
  );
}
