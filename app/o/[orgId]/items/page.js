'use client';
import { useState } from 'react';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Field, Empty } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { money, qty } from '../../../ui/format.js';

const blank = { name: '', sku: '', unitId: '', hsnCode: '', gstRate: '', salePrice: '', purchasePrice: '', reorderLevel: '', openingQty: '', openingRate: '' };

export default function Items() {
  const { org, can } = useOrg();
  const [q, setQ] = useState('');
  const list = useApi(() => api(`/orgs/${org.id}/items`, { query: { q } }), [org.id, q]);
  const units = useApi(() => api(`/orgs/${org.id}/units`), [org.id]);
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const [form, setForm] = useState(blank);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function startEdit(it) {
    setEditing(it ?? 'new'); setError(null);
    setForm(it ? Object.fromEntries(Object.keys(blank).map((k) => [k, String(it[k] ?? '')])) : { ...blank, unitId: units.data?.units.find((u) => u.symbol === 'pcs')?.id ?? '' });
  }
  async function save(e) {
    e.preventDefault(); setError(null);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' && !['name', 'sku', 'hsnCode', 'unitId'].includes(k) ? '0' : v]));
    try {
      if (editing === 'new') await api(`/orgs/${org.id}/items`, { method: 'POST', body });
      else await api(`/orgs/${org.id}/items/${editing.id}`, { method: 'PATCH', body });
      setEditing(null); list.reload();
    } catch (err) { setError(err); }
  }

  const items = list.data?.items ?? [];
  return (
    <>
      <PageHead title="Stock items" sub={`${items.length} items · stock is updated by every sale and purchase`}
        actions={can('masters.write') && <button className="btn btn-primary" onClick={() => startEdit(null)}>+ New item</button>} />
      {editing && (
        <form className="card grid" onSubmit={save}>
          <h2>{editing === 'new' ? 'New item' : `Edit ${editing.name}`}</h2>
          <ErrorNote error={error} />
          <div className="grid grid-3">
            <Field label="Name"><input required maxLength={160} value={form.name} onChange={set('name')} /></Field>
            <Field label="SKU / code"><input maxLength={60} value={form.sku} onChange={set('sku')} /></Field>
            <Field label="Unit"><select required value={form.unitId} onChange={set('unitId')}>
              <option value="">Choose…</option>{units.data?.units.map((u) => <option key={u.id} value={u.id}>{u.symbol} · {u.name}</option>)}</select></Field>
            <Field label="HSN / SAC"><input inputMode="numeric" maxLength={8} value={form.hsnCode} onChange={set('hsnCode')} /></Field>
            <Field label="GST %"><input inputMode="decimal" value={form.gstRate} onChange={set('gstRate')} placeholder="0" /></Field>
            <Field label="Sale price ₹" hint="Before GST"><input inputMode="decimal" value={form.salePrice} onChange={set('salePrice')} placeholder="0" /></Field>
            <Field label="Purchase price ₹"><input inputMode="decimal" value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="0" /></Field>
            <Field label="Reorder level"><input inputMode="decimal" value={form.reorderLevel} onChange={set('reorderLevel')} placeholder="0" /></Field>
            <Field label="Opening stock qty"><input inputMode="decimal" value={form.openingQty} onChange={set('openingQty')} placeholder="0" /></Field>
            <Field label="Opening rate ₹" hint="Cost per unit of opening stock"><input inputMode="decimal" value={form.openingRate} onChange={set('openingRate')} placeholder="0" /></Field>
          </div>
          <div className="row"><button className="btn btn-primary">Save</button><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      )}
      <input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search" />
      <div className="card">
        <ErrorNote error={list.error} />
        {list.loading && !list.data ? <Loading /> : items.length === 0 ? <Empty>No items yet.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th>HSN</th><th className="num">GST</th><th className="num">Sale price</th><th className="num">In stock</th><th></th></tr></thead>
            <tbody>{items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}{it.sku && <div className="muted mono" style={{ fontSize: 12 }}>{it.sku}</div>}</td>
                <td>{it.hsnCode}</td><td className="num">{it.gstRate}%</td><td className="num">{money(it.salePrice)}</td>
                <td className="num"><span className={it.stockQty <= it.reorderLevel ? 'badge badge-warn' : ''}>{qty(it.stockQty)} {it.unitSymbol}</span></td>
                <td className="num">{can('masters.write') && <button className="btn btn-sm" onClick={() => startEdit(it)}>Edit</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
