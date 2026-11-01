'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Empty } from '../../../../ui/components.js';
import { useOrg } from '../../../../ui/OrgContext.js';
import { amount, date, today, VOUCHER_TYPES } from '../../../../ui/format.js';

const drcr = (n) => `${amount(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;

export default function LedgerStatement({ params }) {
  const { ledgerId } = use(params);
  const { org, base } = useOrg();
  const [from, setFrom] = useState(org.booksFrom);
  const [to, setTo] = useState(today());
  const st = useApi(() => api(`/orgs/${org.id}/reports/ledger`, { query: { ledger: ledgerId, from, to } }), [org.id, ledgerId, from, to]);
  return (
    <>
      <PageHead title={st.data?.ledger ?? 'Ledger'} sub="Ledger statement" actions={<button className="btn no-print" onClick={() => window.print()}>Print</button>} />
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 170 }} aria-label="From" />
        <span className="muted">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 170 }} aria-label="To" />
      </div>
      <div className="card">
        <ErrorNote error={st.error} />
        {st.loading && !st.data ? <Loading /> : st.data && (
          <div className="table-wrap"><table>
            <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              <tr><td>{date(st.data.from)}</td><td colSpan={4} className="muted">Opening balance</td><td className="num">{drcr(st.data.opening)}</td></tr>
              {st.data.lines.map((l, i) => (
                <tr key={i}><td>{date(l.date)}</td><td><Link href={`${base}/vouchers/${l.voucherId}`}>{l.label}</Link><div className="muted" style={{ fontSize: 12 }}>{VOUCHER_TYPES[l.type]}</div></td>
                  <td>{l.particulars}</td><td className="num">{l.debit ? amount(l.debit) : ''}</td><td className="num">{l.credit ? amount(l.credit) : ''}</td><td className="num">{drcr(l.balance)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5}>Closing balance</td><td className="num">{drcr(st.data.closing)}</td></tr></tfoot>
          </table></div>
        )}
        {st.data && st.data.lines.length === 0 && <Empty>No entries in this period.</Empty>}
      </div>
    </>
  );
}
