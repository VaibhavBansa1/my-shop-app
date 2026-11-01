'use client';
// "Scan invoice" panel for the purchase form: photo -> server OCR -> reviewed draft.
import { useState } from 'react';
import { api, apiUpload, shrinkImage } from './api.js';
import { ErrorNote } from './components.js';
import { money } from './format.js';

export default function ScanInvoice({ orgId, units, items, ledgers, onApply }) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [choice, setChoice] = useState({});      // line index -> stockItemId | 'new' | ''
  const [error, setError] = useState(null);
  const [supplierName, setSupplierName] = useState('');

  async function createSupplier() {
    setBusy(true); setError(null);
    try {
      const { groups } = await api(`/orgs/${orgId}/groups`);
      const creditors = groups.find((g) => g.code === 'sundry_creditors');
      const l = await api(`/orgs/${orgId}/ledgers`, { method: 'POST', body: {
        name: supplierName.trim(), groupId: creditors.id, gstin: draft.supplierGstin, stateCode: draft.supplierGstin.slice(0, 2) } });
      setDraft({ ...draft, supplier: { ledgerId: l.id, name: l.name, stateCode: l.stateCode } });
    } catch (err) { setError(err); }
    setBusy(false);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(null); setDraft(null);
    try {
      const blob = await shrinkImage(file);
      const d = await apiUpload(`/orgs/${orgId}/ocr/invoice`, blob);
      setDraft(d);
      setSupplierName(d.supplierName ?? '');
      setChoice(Object.fromEntries(d.items.map((l, i) => [i, l.match?.stockItemId ?? 'new'])));
    } catch (err) { setError(err); }
    setBusy(false);
  }

  async function apply() {
    setBusy(true); setError(null);
    try {
      const pcs = units.find((u) => u.symbol === 'pcs')?.id ?? units[0]?.id;
      const lines = [];
      for (const [i, l] of draft.items.entries()) {
        let id = choice[i];
        if (!id) continue;                      // skipped by user
        if (id === 'new') {
          const created = await api(`/orgs/${orgId}/items`, { method: 'POST', body: {
            name: l.description, unitId: pcs, hsnCode: l.hsn && /^\d{4,8}$/.test(l.hsn) ? l.hsn : '',
            gstRate: String(l.gstRate ?? 0), purchasePrice: String(l.rate) } });
          id = created.id;
        }
        lines.push({ stockItemId: id, qty: String(l.qty), rate: String(l.rate), discount: l.discount ? String(l.discount) : '', gstRate: l.gstRate != null ? String(l.gstRate) : '' });
      }
      onApply({
        partyLedgerId: draft.supplier?.ledgerId ?? '', reference: draft.invoiceNumber ?? '', date: draft.invoiceDate,
        placeOfSupply: '', narration: `Scanned invoice${draft.invoiceNumber ? ` ${draft.invoiceNumber}` : ''}`, items: lines,
      });
      setDraft(null);
    } catch (err) { setError(err); }
    setBusy(false);
  }

  return (
    <div className="card no-print">
      <div className="row">
        <div><h2 style={{ margin: 0 }}>Scan a supplier invoice</h2>
          <p className="muted" style={{ fontSize: 13 }}>Take or upload a clear photo. We read it and fill this form for you to check. The photo is not stored.</p></div>
        <span className="spacer" />
        <label className="btn btn-primary">{busy ? 'Reading…' : '📷 Scan invoice'}
          <input type="file" accept="image/jpeg,image/png,image/*" capture="environment" onChange={onFile} disabled={busy} hidden />
        </label>
      </div>
      <ErrorNote error={error} />
      {draft && (
        <div className="grid" style={{ marginTop: 12 }}>
          {draft.warnings.map((w, i) => <div key={i} className="note note-warn">{w}</div>)}
          <div className="grid grid-3">
            <div><span className="muted">Supplier</span><div><b>{draft.supplier?.name ?? (draft.supplierGstin ? `Not in your ledgers (GSTIN ${draft.supplierGstin})` : 'Not found')}</b></div></div>
            <div><span className="muted">Invoice</span><div><b>{draft.invoiceNumber ?? '—'}</b> · {draft.invoiceDate ?? 'no date'}</div></div>
            <div><span className="muted">Invoice total</span><div><b>{draft.totals.total != null ? money(draft.totals.total) : '—'}</b></div></div>
          </div>
          {!draft.supplier && draft.supplierGstin && (
            <div className="row">
              <input aria-label="Supplier name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" style={{ maxWidth: 320 }} />
              <button type="button" className="btn btn-sm" disabled={busy || !supplierName.trim()} onClick={createSupplier}>+ Create supplier with this GSTIN</button>
            </div>
          )}
          <div className="table-wrap"><table>
            <thead><tr><th>Read from invoice</th><th className="num">Qty</th><th className="num">Rate</th><th>Use stock item</th></tr></thead>
            <tbody>{draft.items.map((l, i) => (
              <tr key={i}><td>{l.description}{l.hsn && <div className="muted" style={{ fontSize: 12 }}>HSN {l.hsn}{l.gstRate != null ? ` · GST ${l.gstRate}%` : ''}</div>}</td>
                <td className="num">{l.qty}</td><td className="num">{l.rate}</td>
                <td><select value={choice[i] ?? ''} onChange={(e) => setChoice({ ...choice, [i]: e.target.value })} aria-label={`Item for ${l.description}`}>
                  <option value="new">+ Create new item “{l.description.slice(0, 30)}”</option>
                  <option value="">Skip this line</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select></td></tr>
            ))}</tbody>
          </table></div>
          <div className="row"><button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>Fill the purchase form</button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>Discard</button>
            <span className="muted" style={{ fontSize: 13 }}>Read with {draft.ocr.engine}{draft.ocr.confidence != null ? ` · ${draft.ocr.confidence}% confidence` : ''}</span></div>
        </div>
      )}
    </div>
  );
}
