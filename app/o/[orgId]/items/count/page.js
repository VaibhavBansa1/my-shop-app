'use client';
// Physical stock count: type what is actually on the shelf; differences become one stock adjustment.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Field } from '../../../../ui/components.js';
import { useOrg } from '../../../../ui/OrgContext.js';
import { qty, today } from '../../../../ui/format.js';

export default function StockCount() {
  const { org, base, can } = useOrg();
  const router = useRouter();
  const list = useApi(() => api(`/orgs/${org.id}/items`), [org.id]);
  const [counted, setCounted] = useState({});
  const [reason, setReason] = useState(`Physical stock count ${today()}`);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const items = useMemo(() => (list.data?.items ?? []).filter((i) => i.isActive && i.name.toLowerCase().includes(q.toLowerCase())), [list.data, q]);
  const diffs = (list.data?.items ?? []).map((i) => {
    const c = counted[i.id];
    if (c === undefined || c === '' || Number.isNaN(Number(c))) return null;
    const d = Math.round((Number(c) - i.stockQty) * 1000) / 1000;
    return d === 0 ? null : { item: i, diff: d };
  }).filter(Boolean);

  async function save() {
    setBusy(true); setError(null);
    try {
      const v = await api(`/orgs/${org.id}/vouchers`, { method: 'POST', body: {
        type: 'stock_adjustment', date: today(), narration: reason,
        items: diffs.map((x) => ({ stockItemId: x.item.id, qty: String(Math.abs(x.diff)), direction: x.diff > 0 ? 'in' : 'out' })) } });
      router.push(`${base}/vouchers/${v.id}`);
    } catch (e) { setError(e); setBusy(false); }
  }

  if (!can('voucher.create.stock_adjustment')) return <ErrorNote error={new Error('Only accountants, admins and owners can adjust stock.')} />;
  return (
    <>
      <PageHead title="Count stock" sub="Enter what is actually on the shelf. Only items you fill in and that differ are adjusted."
        actions={<Link className="btn" href={`${base}/items`}>Back to stock</Link>} />
      <input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} aria-label="Search" />
      <div className="card">
        <ErrorNote error={list.error || error} />
        {list.loading && !list.data ? <Loading /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Item</th><th className="num">In books</th><th className="num">Counted</th><th className="num">Difference</th></tr></thead>
            <tbody>{items.map((i) => {
              const d = diffs.find((x) => x.item.id === i.id)?.diff ?? 0;
              return (<tr key={i.id}><td>{i.name}</td><td className="num">{qty(i.stockQty)} {i.unitSymbol}</td>
                <td className="num"><input inputMode="decimal" style={{ maxWidth: 110, textAlign: 'right' }} value={counted[i.id] ?? ''} aria-label={`Counted ${i.name}`}
                  onChange={(e) => setCounted({ ...counted, [i.id]: e.target.value })} /></td>
                <td className="num" style={{ color: d < 0 ? 'var(--danger)' : d > 0 ? 'var(--ok)' : undefined }}>{d ? `${d > 0 ? '+' : ''}${qty(d)}` : ''}</td></tr>);
            })}</tbody>
          </table></div>
        )}
      </div>
      <div className="card grid">
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} /></Field>
        <div className="row"><button className="btn btn-primary" disabled={!diffs.length || busy || !reason.trim()} onClick={save}>
          {busy ? 'Saving…' : `Save ${diffs.length} adjustment${diffs.length === 1 ? '' : 's'}`}</button></div>
      </div>
    </>
  );
}
