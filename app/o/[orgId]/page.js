'use client';
import Link from 'next/link';
import { api } from '../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead } from '../../ui/components.js';
import { useOrg } from '../../ui/OrgContext.js';
import { money, qty } from '../../ui/format.js';

export default function Dashboard() {
  const { org, base, can } = useOrg();
  const d = useApi(() => api(`/orgs/${org.id}/reports/dashboard`), [org.id]);
  return (
    <>
      <PageHead title={org.name} sub="Today at a glance" />
      <div className="quick no-print">
        {can('voucher.create.sales') && <Link className="btn btn-primary" href={`${base}/vouchers/new?type=sales`}>+ Sale</Link>}
        {can('voucher.create.receipt') && <Link className="btn" href={`${base}/vouchers/new?type=receipt`}>+ Receipt</Link>}
        {can('voucher.create.purchase') && <Link className="btn" href={`${base}/vouchers/new?type=purchase`}>+ Purchase</Link>}
        {can('voucher.create.payment') && <Link className="btn" href={`${base}/vouchers/new?type=payment`}>+ Expense / payment</Link>}
      </div>
      <ErrorNote error={d.error} />
      {d.loading && !d.data ? <Loading /> : d.data && (
        <>
          <div className="grid grid-4">
            <div className="card stat"><span>Sales today</span><b>{money(d.data.today.sales)}</b></div>
            <div className="card stat"><span>Sales this month</span><b>{money(d.data.month.sales?.total ?? 0)}</b></div>
            <div className="card stat"><span>Cash &amp; bank</span><b>{money(d.data.cashAndBank)}</b></div>
            <div className="card stat"><span>Stock value</span><b>{money(d.data.stockValue)}</b></div>
          </div>
          <div className="grid grid-2" style={{ marginTop: 14 }}>
            <div className="card">
              <h2>This month</h2>
              <table><tbody>
                {['sales', 'purchase', 'receipt', 'payment'].map((t) => (
                  <tr key={t}><td style={{ textTransform: 'capitalize' }}>{t === 'payment' ? 'Payments' : t === 'receipt' ? 'Receipts' : t}</td>
                    <td className="muted">{d.data.month[t]?.count ?? 0}</td><td className="num">{money(d.data.month[t]?.total ?? 0)}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div className="card">
              <h2>Low stock</h2>
              {d.data.lowStock.length === 0 ? <p className="muted">Nothing is below its reorder level.</p> : (
                <table><tbody>{d.data.lowStock.map((i) => (
                  <tr key={i.itemId}><td>{i.name}</td><td className="num"><span className="badge badge-warn">{qty(i.qty)} {i.unit}</span></td></tr>
                ))}</tbody></table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
