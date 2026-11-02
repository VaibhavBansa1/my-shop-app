'use client';
// Settings card: turn two-step login on/off and manage recovery codes.
import { useState } from 'react';
import { api } from './api.js';
import { useApi, ErrorNote, Field } from './components.js';

export default function TwoFactorCard() {
  const st = useApi(() => api('/me/two-factor'), []);
  const [step, setStep] = useState(null);        // null | {secret, uri}
  const [codes, setCodes] = useState(null);      // recovery codes shown once
  const [f, setF] = useState({ password: '', code: '' });
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null);        // 'disable' | 'regen'
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (body, after) => { setError(null); try { const r = await api('/me/two-factor', { method: 'POST', body }); await after(r); setF({ password: '', code: '' }); } catch (e) { setError(e); } };
  const s = st.data;
  return (
    <div className="card grid" id="two-step">
      <h2>Two-step login</h2>
      <p className="muted">After your password, sign-in also asks for a 6-digit code from an authenticator app on your phone
        (Google Authenticator, Microsoft Authenticator, Authy…). Someone who learns your password still cannot get in.
        Strongly recommended for owners and admins.</p>
      <ErrorNote error={error} />
      {codes && (
        <div className="note note-warn">
          <b>Save these recovery codes now.</b> Each one works once, if you lose your phone. They will not be shown again.
          <pre className="mono" style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{codes.join('\n')}</pre>
          <div className="row"><button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</button>
            <button type="button" className="btn btn-sm" onClick={() => setCodes(null)}>I have saved them</button></div>
        </div>
      )}
      {s && !s.enabled && !step && (
        <form className="grid" onSubmit={(e) => { e.preventDefault(); go({ action: 'setup', password: f.password }, (r) => setStep(r)); }}>
          <Field label="Your password" hint="To start setting up two-step login"><input type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} /></Field>
          <div className="row"><button className="btn btn-primary">Set up two-step login</button></div>
        </form>
      )}
      {step && (
        <form className="grid" onSubmit={(e) => { e.preventDefault(); go({ action: 'enable', code: f.code }, (r) => { setCodes(r.recoveryCodes); setStep(null); st.reload(); }); }}>
          <p>1. In your authenticator app choose <b>Add account → Enter a setup key</b> and type this key
            (on this phone you can <a href={step.uri}>open it in the app</a>):</p>
          <p className="mono" style={{ fontSize: 18, letterSpacing: 2, wordBreak: 'break-all' }}>{step.secret.match(/.{1,4}/g).join(' ')}</p>
          <Field label="2. Type the 6-digit code the app shows"><input inputMode="numeric" autoComplete="one-time-code" required maxLength={7} value={f.code} onChange={set('code')} /></Field>
          <div className="row"><button className="btn btn-primary">Turn on</button><button type="button" className="btn" onClick={() => setStep(null)}>Cancel</button></div>
        </form>
      )}
      {s?.enabled && (
        <>
          <p><span className="badge">On</span> since {new Date(s.enabledAt).toLocaleDateString('en-IN')} · {s.recoveryCodesLeft} recovery codes left
            {s.recoveryCodesLeft < 3 && <b> — make new ones soon</b>}</p>
          {!mode && <div className="row"><button className="btn btn-sm" onClick={() => setMode('regen')}>New recovery codes</button>
            <button className="btn btn-sm btn-danger" onClick={() => setMode('disable')}>Turn off</button></div>}
          {mode && (
            <form className="grid" onSubmit={(e) => { e.preventDefault(); go({ action: mode === 'regen' ? 'recovery-codes' : 'disable', ...f }, (r) => { if (r.recoveryCodes) setCodes(r.recoveryCodes); setMode(null); st.reload(); }); }}>
              <div className="grid grid-2">
                <Field label="Your password"><input type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} /></Field>
                <Field label="Code from the app (or a recovery code)"><input autoComplete="one-time-code" required maxLength={20} value={f.code} onChange={set('code')} /></Field>
              </div>
              <div className="row"><button className={`btn ${mode === 'disable' ? 'btn-danger' : 'btn-primary'}`}>{mode === 'disable' ? 'Turn off two-step login' : 'Make new codes'}</button>
                <button type="button" className="btn" onClick={() => setMode(null)}>Cancel</button></div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
