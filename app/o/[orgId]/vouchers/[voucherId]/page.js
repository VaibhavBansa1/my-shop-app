'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../../ui/api.js';
import { useApi, Loading, ErrorNote, Field } from '../../../../ui/components.js';
import { useOrg } from '../../../../ui/OrgContext.js';
import { money, amount, date, qty, VOUCHER_TYPES } from '../../../../ui/format.js';
import { STATES } from '../../../../ui/states.js';
import { invoiceMessage, whatsappUrl } from '../../../../../shared/messages.js';

export default function VoucherView({ params }) {
  const { voucherId } = use(params);
  const { org, base, can } = useOrg();
  const v = useApi(() => api(`/orgs/${org.id}/vouchers/${voucherId}`), [org.id, voucherId]);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  async function cancel(e) {
    e.preventDefault(); setError(null);
    try { await api(`/orgs/${org.id}/vouchers/${voucherId}/cancel`, { method: 'POST', body: { reason } }); setCancelling(false); v.reload(); }
    catch (err) { setError(err); }
  }

  if (v.loading && !v.data) return <Loading />;
  if (v.error) return <ErrorNote error={v.error} />;
  const d = v.data;
  const isInvoice = d.items.length > 0;
  const inter = d.items.some((i) => i.igst);
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <Link className="btn btn-sm" href={`${base}/vouchers`}>← Vouchers</Link>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => window.print()}>Print / PDF</button>
        {d.items.length > 0 && d.status === 'posted' && <a className="btn btn-sm" target="_blank" rel="noopener noreferrer"
          href={whatsappUrl('', invoiceMessage({ shopName: org.legalName || org.name, label: d.label, date: date(d.date), total: d.total, items: d.items }))}>WhatsApp</a>}
        {d.status === 'posted' && can('voucher.cancel') && can(`voucher.create.${d.type}`) && <Link className="btn btn-sm" href={`${base}/vouchers/new?type=${d.type}&from=${d.id}`}>Correct…</Link>}
        {d.status === 'posted' && can('voucher.cancel') && <button className="btn btn-sm btn-danger" onClick={() => setCancelling(true)}>Cancel voucher</button>}
      </div>
      {d.status === 'cancelled' && <div className="note note-error">Cancelled{d.cancelReason ? `: ${d.cancelReason}` : ''}. It no longer counts in any report.</div>}
      {cancelling && (
        <form className="card grid no-print" onSubmit={cancel}>
          <ErrorNote error={error} />
          <Field label="Why are you cancelling this voucher?" hint="Cancelled vouchers stay on record (with this reason) so the numbering and audit trail stay complete.">
            <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="row"><button className="btn btn-danger">Confirm cancel</button><button type="button" className="btn" onClick={() => setCancelling(false)}>Keep it</button></div>
        </form>
      )}
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1>{org.legalName || org.name}</h1>
            {org.address && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{org.address}</p>}
            {org.gstin && <p className="muted">GSTIN {org.gstin}</p>}
          </div>
          <span className="spacer" />
          <div style={{ textAlign: 'right' }}>
            <h2>{d.type === 'sales' && org.gstin ? 'Tax Invoice' : VOUCHER_TYPES[d.type]}</h2>
            <p><b>{d.label}</b></p>
            <p className="muted">{date(d.date)}</p>
          </div>
        </div>
        {d.partyName && <p style={{ marginTop: 12 }}><span className="muted">{d.type === 'sales' || d.type === 'credit_note' ? 'Bill to' : 'Party'}:</span> <b>{d.partyName}</b>
          {d.placeOfSupply && <span className="muted"> · Place of supply {d.placeOfSupply} {STATES[d.placeOfSupply] ?? ''}</span>}</p>}
        {d.reference && <p className="muted">Ref: {d.reference}</p>}

        {isInvoice ? (
          <div className="table-wrap" style={{ marginTop: 12 }}><table>
            <thead><tr><th>#</th><th>Item</th><th>HSN</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc.</th><th className="num">Taxable</th><th className="num">GST %</th><th className="num">{inter ? 'IGST' : 'CGST + SGST'}</th></tr></thead>
            <tbody>{d.items.map((i, n) => (
              <tr key={n}><td>{n + 1}</td><td>{i.name}{i.description && <div className="muted">{i.description}</div>}</td><td>{i.hsnCode}</td>
                <td className="num">{qty(i.qty)} {i.unit}</td><td className="num">{amount(i.rate)}</td><td className="num">{i.discount ? amount(i.discount) : ''}</td>
                <td className="num">{amount(i.taxableValue)}</td><td className="num">{i.gstRate}</td><td className="num">{amount(i.igst || i.cgst + i.sgst)}</td></tr>
            ))}</tbody>
          </table></div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}><table>
            <thead><tr><th>Ledger</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>{d.entries.map((e, n) => <tr key={n}><td>{e.ledgerName}</td><td className="num">{e.debit ? amount(e.debit) : ''}</td><td className="num">{e.credit ? amount(e.credit) : ''}</td></tr>)}</tbody>
          </table></div>
        )}
        <div className="totals" style={{ marginTop: 12 }}>
          {isInvoice && <>
            <div><span>Taxable value</span><span className="num">{money(d.taxableTotal)}</span></div>
            {d.taxTotal > 0 && <div><span>GST</span><span className="num">{money(d.taxTotal)}</span></div>}
            {d.roundOff !== 0 && <div><span>Round off</span><span className="num">{money(d.roundOff)}</span></div>}
          </>}
          <div className="grand"><span>Total</span><span className="num">{money(d.total)}</span></div>
        </div>
        {d.narration && <p style={{ marginTop: 12 }}><span className="muted">Narration:</span> {d.narration}</p>}
        {isInvoice && (
          <details className="no-print" style={{ marginTop: 14 }}><summary className="muted">Accounting entries</summary>
            <table><tbody>{d.entries.map((e, n) => <tr key={n}><td>{e.ledgerName}</td><td className="num">{e.debit ? `Dr ${amount(e.debit)}` : ''}</td><td className="num">{e.credit ? `Cr ${amount(e.credit)}` : ''}</td></tr>)}</tbody></table>
          </details>
        )}
        <p className="muted no-print" style={{ marginTop: 12, fontSize: 13 }}>Entered by {d.createdBy} · {new Date(d.createdAt).toLocaleString('en-IN')}</p>
      </div>
    </>
  );
}
