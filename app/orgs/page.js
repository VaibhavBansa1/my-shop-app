'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../ui/api.js';
import { useApi, Field, ErrorNote, Loading } from '../ui/components.js';
import { ROLE_LABEL } from '../ui/format.js';
import { STATE_LIST } from '../ui/states.js';

export default function OrgsPage() {
  const me = useApi(() => api('/me'), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', gstin: '', stateCode: '23', address: '', phone: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function create(e) {
    e.preventDefault(); setError(null);
    try {
      const org = await api('/orgs', { method: 'POST', body: { ...form, gstin: form.gstin.trim().toUpperCase() } });
      window.location.href = `/o/${org.id}`;
    } catch (err) { setError(err); }
  }
  async function logout() { await api('/auth/logout', { method: 'POST' }); window.location.href = '/'; }

  if (me.loading) return <Loading />;
  const orgs = me.data?.orgs ?? [];
  return (
    <div className="public">
      <header className="public-top">
        <Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link>
        <div className="row"><span className="muted">{me.data?.user?.name}</span><button className="btn btn-sm" onClick={logout}>Sign out</button></div>
      </header>
      <div className="auth-box" style={{ maxWidth: 560 }}>
        <div className="card">
          <h1 style={{ marginBottom: 12 }}>Your businesses</h1>
          {orgs.length === 0 && <p className="muted">You don’t have a business yet. Create one below, or open an invitation link from your employer.</p>}
          <div className="grid">
            {orgs.map((o) => (
              <Link key={o.id} href={`/o/${o.id}`} className="org-switch">{o.name}<small>{ROLE_LABEL[o.role]}{o.gstin ? ` · GSTIN ${o.gstin}` : ''}</small></Link>
            ))}
          </div>
        </div>
        <div className="card">
          {!creating ? <button className="btn btn-primary btn-block" onClick={() => setCreating(true)}>+ Create a new business</button> : (
            <form className="grid" onSubmit={create}>
              <h2>New business</h2>
              <ErrorNote error={error} />
              <Field label="Business name"><input required maxLength={120} value={form.name} onChange={set('name')} /></Field>
              <Field label="GSTIN (optional)" hint="Leave empty if you are not GST registered. GST is only charged when a GSTIN is set.">
                <input maxLength={15} value={form.gstin} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} />
              </Field>
              <Field label="State"><select value={form.stateCode} onChange={set('stateCode')}>
                {STATE_LIST.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
              <Field label="Address"><textarea maxLength={500} value={form.address} onChange={set('address')} /></Field>
              <Field label="Phone"><input maxLength={40} value={form.phone} onChange={set('phone')} /></Field>
              <div className="row"><button className="btn btn-primary">Create</button><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button></div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
