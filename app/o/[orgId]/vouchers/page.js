'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Empty } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { money, date, VOUCHER_TYPES, monthStart, today } from '../../../ui/format.js';
import { downloadCsv } from '../../../ui/download.js';

export default function Vouchers() {
  const { org, base } = useOrg();
  const [type, setType] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const list = useApi(() => api(`/orgs/${org.id}/vouchers`, { query: { type, from, to, limit: 300 } }), [org.id, type, from, to]);
  return (
    <>
      <PageHead title="Vouchers" sub="Every sale, purchase, receipt and payment" actions={<>
        <button className="btn" disabled={!list.data?.vouchers.length} onClick={() => downloadCsv(`${org.name}-vouchers-${from}-to-${to}.csv`,
          [['Date', 'Voucher', 'Type', 'Party', 'Taxable', 'GST', 'Total', 'Status', 'Reference', 'Narration'],
           ...list.data.vouchers.map((v) => [v.date, v.label, VOUCHER_TYPES[v.type], v.partyName, v.taxableTotal, v.taxTotal, v.total, v.status, v.reference, v.narration])])}>Download CSV</button>
        <Link className="btn btn-primary" href={`${base}/vouchers/new?type=${type || 'sales'}`}>+ New</Link></>} />
      <div className="chips">
        <button className={`chip ${type === '' ? 'active' : ''}`} onClick={() => setType('')}>All</button>
        {Object.entries(VOUCHER_TYPES).map(([k, v]) => <button key={k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => setType(k)}>{v}</button>)}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 170 }} aria-label="From" />
        <span className="muted">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 170 }} aria-label="To" />
      </div>
      <div className="card">
        <ErrorNote error={list.error} />
        {list.loading && !list.data ? <Loading /> : list.data?.vouchers.length === 0 ? <Empty>No vouchers in this period.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>No.</th><th>Type</th><th>Party</th><th className="num">Amount</th></tr></thead>
            <tbody>{list.data?.vouchers.map((v) => (
              <tr key={v.id} className={v.status === 'cancelled' ? 'strike' : ''}>
                <td>{date(v.date)}</td>
                <td><Link href={`${base}/vouchers/${v.id}`}>{v.label}</Link></td>
                <td>{VOUCHER_TYPES[v.type]}{v.status === 'cancelled' && <> <span className="badge badge-danger">Cancelled</span></>}</td>
                <td>{v.partyName ?? '—'}</td>
                <td className="num">{money(v.total)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
