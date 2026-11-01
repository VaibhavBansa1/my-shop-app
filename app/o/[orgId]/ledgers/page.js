'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Field, Empty } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { money } from '../../../ui/format.js';
import { STATE_LIST } from '../../../ui/states.js';

const FILTERS = [['', 'All'], ['sundry_debtors', 'Customers'], ['sundry_creditors', 'Suppliers'], ['current_assets', 'Cash & bank'], ['indirect_expenses', 'Expenses']];

export default function Ledgers() {
  const { org, base, can } = useOrg();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const list = useApi(() => api(`/orgs/${org.id}/ledgers`, { query: { group: filter, q } }), [org.id, filter, q]);
  const groups = useApi(() => api(`/orgs/${org.id}/groups`), [org.id]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', groupId: '', openingBalance: '', side: 'debit', gstin: '', stateCode: '', phone: '', email: '', address: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const fullAccess = can('masters.write');
  const groupList = (groups.data?.groups ?? []).filter((g) => fullAccess || ['sundry_debtors', 'sundry_creditors'].includes(g.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function create(e) {
    e.preventDefault(); setError(null);
    const ob = Number(form.openingBalance || 0);
    try {
      await api(`/orgs/${org.id}/ledgers`, { method: 'POST', body: {
        name: form.name, groupId: form.groupId, openingBalance: String(form.side === 'credit' ? -ob : ob),
        gstin: form.gstin.trim().toUpperCase(), stateCode: form.stateCode, phone: form.phone, email: form.email, address: form.address } });
      setOpen(false); setForm({ ...form, name: '', openingBalance: '', gstin: '', phone: '', email: '', address: '' }); list.reload();
    } catch (err) { setError(err); }
  }

  return (
    <>
      <PageHead title="Parties & ledgers" sub="Customers, suppliers, cash, bank, income and expense accounts"
        actions={can('party.create') && <button className="btn btn-primary" onClick={() => setOpen(!open)}>+ New ledger</button>} />
      {open && (
        <form className="card grid" onSubmit={create}>
          <ErrorNote error={error} />
          <div className="grid grid-2">
            <Field label="Name"><input required maxLength={120} value={form.name} onChange={set('name')} /></Field>
            <Field label="Under group"><select required value={form.groupId} onChange={set('groupId')}>
              <option value="">Choose…</option>{groupList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
            <Field label="Opening balance ₹"><input inputMode="decimal" value={form.openingBalance} onChange={set('openingBalance')} placeholder="0" /></Field>
            <Field label="Opening is" hint="Customers who owe you and assets: Debit. Suppliers you owe, loans and capital: Credit.">
              <select value={form.side} onChange={set('side')}><option value="debit">Debit (Dr)</option><option value="credit">Credit (Cr)</option></select></Field>
            <Field label="GSTIN (optional)"><input maxLength={15} value={form.gstin} onChange={set('gstin')} style={{ textTransform: 'uppercase' }} /></Field>
            <Field label="State"><select value={form.stateCode} onChange={set('stateCode')}><option value="">—</option>
              {STATE_LIST.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select></Field>
            <Field label="Phone"><input maxLength={40} value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><input type="email" maxLength={254} value={form.email} onChange={set('email')} /></Field>
          </div>
          <Field label="Address"><textarea maxLength={500} value={form.address} onChange={set('address')} /></Field>
          <div className="row"><button className="btn btn-primary">Save ledger</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      <div className="chips">{FILTERS.map(([k, v]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{v}</button>)}</div>
      <input placeholder="Search ledgers…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search" />
      <div className="card">
        <ErrorNote error={list.error} />
        {list.loading && !list.data ? <Loading /> : list.data?.ledgers.length === 0 ? <Empty>No ledgers found.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Group</th><th className="num">Opening</th></tr></thead>
            <tbody>{list.data?.ledgers.map((l) => (
              <tr key={l.id}><td><Link href={`${base}/ledgers/${l.id}`}>{l.name}</Link>{!l.isActive && <> <span className="badge badge-muted">Inactive</span></>}</td>
                <td className="muted">{l.groupName}</td>
                <td className="num">{l.openingBalance ? `${money(Math.abs(l.openingBalance))} ${l.openingBalance > 0 ? 'Dr' : 'Cr'}` : ''}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
