'use client';
// GST e-invoice JSON downloads (for upload on the government Invoice Registration Portal).
import { useState } from 'react';
import Link from 'next/link';
import { api } from './api.js';
import { useApi, ErrorNote } from './components.js';

function saveJson(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Button on a bill: downloads the JSON, or explains what to fix first. */
export function EInvoiceButton({ orgId, voucherId, label }) {
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState(null);
  async function go() {
    setError(null); setProblems(null);
    try {
      const r = await api(`/orgs/${orgId}/e-invoice`, { query: { voucherId } });
      if (!r.json || r.problems.length) setProblems(r.problems);
      else saveJson(`e-invoice-${label.replace(/[^\w-]+/g, '-')}.json`, [r.json]);
    } catch (e) { setError(e); }
  }
  return (<>
    <button className="btn btn-sm" onClick={go} title="JSON for the government e-invoice portal">E-invoice JSON</button>
    {(problems || error) && <div className="note note-warn no-print" style={{ flexBasis: '100%' }}><ErrorNote error={error} />
      {problems && <><b>Fix these first:</b><ul style={{ margin: '4px 0 0 18px' }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul></>}</div>}
  </>);
}

/** Under the GST Summary: all B2B bills of the period as one upload file, and the ones that need fixing. */
export function EInvoicePeriod({ orgId, base, from, to }) {
  const r = useApi(() => api(`/orgs/${orgId}/e-invoice`, { query: { from, to } }), [orgId, from, to]);
  if (r.error) return <ErrorNote error={r.error} />;
  if (!r.data) return null;
  const { ready, needsFix } = r.data;
  return (
    <div className="card grid no-print">
      <h2>GST e-invoices (B2B bills)</h2>
      <p className="muted">E-invoicing is required only above the government's turnover limit. This prepares the JSON (schema 1.1) for bulk
        upload on the Invoice Registration Portal; the IRN and QR code come from the portal. Bills to customers without a GSTIN are not included.</p>
      <div className="row"><button className="btn btn-primary" disabled={!ready.length} onClick={() => saveJson(`e-invoices-${from}-to-${to}.json`, ready)}>
        Download {ready.length} e-invoice{ready.length === 1 ? '' : 's'}</button></div>
      {needsFix.length > 0 && <div className="note note-warn"><b>{needsFix.length} bill{needsFix.length === 1 ? '' : 's'} need fixing first:</b>
        <ul style={{ margin: '4px 0 0 18px' }}>{needsFix.map((n) => <li key={n.voucherId}><Link href={`${base}/vouchers/${n.voucherId}`}>{n.voucher}</Link>: {n.problems.join(' ')}</li>)}</ul></div>}
    </div>
  );
}
