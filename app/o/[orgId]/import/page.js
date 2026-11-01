'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../ui/api.js';
import { ErrorNote, Loading, PageHead } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { downloadCsv } from '../../../ui/download.js';
import { csvToObjects } from '../../../../shared/csv.js';

const KINDS = {
  items: {
    label: 'Stock items', back: '/items',
    template: [['name', 'sku', 'unit', 'hsn', 'gst_rate', 'sale_price', 'purchase_price', 'reorder_level', 'opening_qty', 'opening_rate'],
      ['Basmati Rice 5kg', 'RICE5', 'pcs', '1006', '5', '510', '420', '8', '24', '420'], ['Sugar', '', 'kg', '1701', '5', '48', '42', '10', '50', '']],
    help: 'Required: name. Unit is a symbol such as pcs, kg, l, box (default pcs). Prices before GST. opening_rate defaults to purchase_price.',
  },
  parties: {
    label: 'Customers & suppliers', back: '/ledgers',
    template: [['name', 'type', 'phone', 'email', 'gstin', 'state_code', 'address', 'opening_balance'],
      ['Ramesh Traders', 'customer', '9876543210', 'ramesh@example.com', '', '23', 'MG Road, Gwalior', '1500'],
      ['Annapurna Wholesale', 'supplier', '', '', '23AAACR5055K1ZF', '23', '', '2000']],
    help: 'Required: name. type is customer or supplier. opening_balance: what a customer owes you, or what you owe a supplier, on your books-begin date.',
  },
};

function ImportInner() {
  const { org, base, can } = useOrg();
  const sp = useSearchParams();
  const kind = KINDS[sp.get('kind')] ? sp.get('kind') : 'items';
  const k = KINDS[kind];
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function check(r = rows, skip = skipExisting) {
    setBusy(true); setError(null);
    try { setResult(await api(`/orgs/${org.id}/import/${kind}`, { method: 'POST', body: { rows: r, dryRun: true, skipExisting: skip } })); }
    catch (e) { setError(e); }
    setBusy(false);
  }
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setResult(null); setError(null); setFileName(f.name);
    if (f.size > 4 * 1024 * 1024) { setError(new Error('The file is too large (max 4 MB).')); return; }
    try {
      const parsed = csvToObjects(await f.text(), { maxRows: 5000 });
      if (!parsed.length) throw new Error('No data rows found. The first row must be the column names.');
      setRows(parsed); await check(parsed);
    } catch (err) { setError(err); }
  }
  async function doImport() {
    setBusy(true); setError(null);
    try { setResult(await api(`/orgs/${org.id}/import/${kind}`, { method: 'POST', body: { rows, dryRun: false, skipExisting } })); setRows(null); }
    catch (e) { setError(e); }
    setBusy(false);
  }

  if (!can('masters.write')) return <ErrorNote error={new Error('Only accountants, admins and owners can import.')} />;
  return (
    <>
      <PageHead title={`Import ${k.label.toLowerCase()}`} sub="From a CSV file (Excel / Google Sheets: File → Save as / Download → CSV)"
        actions={<Link className="btn" href={`${base}${k.back}`}>Back</Link>} />
      <div className="chips">{Object.entries(KINDS).map(([key, v]) => <Link key={key} className={`chip ${key === kind ? 'active' : ''}`} href={`${base}/import?kind=${key}`}>{v.label}</Link>)}</div>
      <div className="card grid">
        <p>{k.help}</p>
        <div className="row">
          <button className="btn" onClick={() => downloadCsv(`${kind}-template.csv`, k.template)}>Download template</button>
          <label className="btn btn-primary">Choose CSV file<input type="file" accept=".csv,text/csv" hidden onChange={onFile} /></label>
          {fileName && <span className="muted">{fileName}</span>}
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={skipExisting}
          onChange={(e) => { setSkipExisting(e.target.checked); if (rows) check(rows, e.target.checked); }} /> Skip names that already exist (instead of treating them as errors)</label>
        <ErrorNote error={error} />
        {busy && <Loading />}
      </div>
      {result && (
        <div className="card grid">
          {result.dryRun ? (
            <>
              <p><b>{result.ready}</b> of {result.total} rows are ready{result.skipped ? `, ${result.skipped} will be skipped (already exist)` : ''}.
                {result.errorCount ? <> <b style={{ color: 'var(--danger)' }}>{result.errorCount} row(s) need fixing</b> — nothing will be imported until every row is valid.</> : ' Nothing has been saved yet.'}</p>
              {result.errorCount > 0 && (
                <div className="table-wrap"><table><thead><tr><th>Row</th><th>Problem</th></tr></thead>
                  <tbody>{result.errors.map((e) => <tr key={e.line}><td>{e.line}</td><td>{e.error}</td></tr>)}</tbody></table></div>
              )}
              {result.preview.length > 0 && (
                <details><summary className="muted">Preview of the first rows</summary>
                  <div className="table-wrap"><table><tbody>{result.preview.map((p, i) => <tr key={i}><td>{p.name}</td><td className="muted">{kind === 'items' ? `₹${p.salePrice} · GST ${p.gstRate}% · opening ${p.openingQty}` : `${p.phone || ''} ${p.gstin || ''} · opening ${p.openingBalance}`}</td></tr>)}</tbody></table></div>
                </details>
              )}
              <div className="row"><button className="btn btn-primary" disabled={busy || result.errorCount > 0 || result.ready === 0} onClick={doImport}>Import {result.ready} row(s)</button></div>
            </>
          ) : (
            <div className="note note-ok">Imported {result.imported} {k.label.toLowerCase()}{result.skipped ? `, skipped ${result.skipped} that already existed` : ''}. <Link href={`${base}${k.back}`}>Open {k.label.toLowerCase()}</Link></div>
          )}
        </div>
      )}
    </>
  );
}

export default function ImportPage() { return <Suspense fallback={<Loading />}><ImportInner /></Suspense>; }
