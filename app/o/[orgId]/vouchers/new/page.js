'use client';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../ui/api.js';
import { useApi, Field, ErrorNote, Loading, PageHead } from '../../../../ui/components.js';
import { useOrg } from '../../../../ui/OrgContext.js';
import { money, today, VOUCHER_TYPES } from '../../../../ui/format.js';
import { STATE_LIST } from '../../../../ui/states.js';
import ScanInvoice from '../../../../ui/ScanInvoice.js';

const ITEM_TYPES = ['sales', 'purchase', 'credit_note', 'debit_note'];
const CASH_BANK = ['cash_in_hand', 'bank_accounts', 'bank_od'];

// Client-side preview only; the server recomputes everything in integer paise.
function previewLine(l, item, gstOn, inter) {
  const q = Number(l.qty) || 0; const r = Number(l.rate) || 0; const disc = Number(l.discount) || 0;
  const taxable = Math.max(Math.round((q * r - disc) * 100) / 100, 0);
  const rate = gstOn ? Number(l.gstRate !== '' ? l.gstRate : item?.gstRate ?? 0) : 0;
  const tax = Math.round(taxable * rate) / 100;
  return { taxable, tax, inter };
}

function VoucherForm() {
  const { org, base, can, on } = useOrg();
  const router = useRouter();
  const sp = useSearchParams();
  const allowed = Object.keys(VOUCHER_TYPES).filter((t) => can(`voucher.create.${t}`));
  const type = allowed.includes(sp.get('type')) ? sp.get('type') : allowed[0];
  const isAdj = type === 'stock_adjustment';
  const isItem = ITEM_TYPES.includes(type) || isAdj;
  const masters = useApi(async () => {
    const [l, i, u] = await Promise.all([api(`/orgs/${org.id}/ledgers`), api(`/orgs/${org.id}/items`), api(`/orgs/${org.id}/units`)]);
    return { ledgers: l.ledgers.filter((x) => x.isActive), items: i.items.filter((x) => x.isActive), units: u.units };
  }, [org.id]);

  const [head, setHead] = useState({ date: today(), partyLedgerId: '', placeOfSupply: '', reference: '', narration: '' });
  const [items, setItems] = useState([{ stockItemId: '', qty: '1', rate: '', discount: '', gstRate: '' }]);
  const [simple, setSimple] = useState({ partyLedgerId: '', cashBankLedgerId: '', amount: '' });
  const [entries, setEntries] = useState([{ ledgerId: '', side: 'debit', amount: '' }, { ledgerId: '', side: 'credit', amount: '' }]);
  const [mode, setMode] = useState('simple');
  // Correction mode: ?from=<voucherId> pre-fills this form; saving cancels the original atomically.
  const fromId = sp.get('from');
  const [original, setOriginal] = useState(null);
  useEffect(() => {
    if (!fromId) return;
    api(`/orgs/${org.id}/vouchers/${fromId}`).then((v) => {
      if (v.type !== type || v.status !== 'posted') return;
      setOriginal(v);
      setHead({ date: v.date, partyLedgerId: v.partyLedgerId && v.items.length ? v.partyLedgerId : '', placeOfSupply: v.placeOfSupply ?? '',
        reference: v.reference, narration: v.narration });
      if (v.items.length) {
        setItems(v.items.map((i) => ({ stockItemId: i.stockItemId, qty: String(i.qty), rate: String(i.rate), discount: i.discount ? String(i.discount) : '', gstRate: String(i.gstRate) })));
      } else {
        setMode('advanced');
        setEntries(v.entries.map((e) => ({ ledgerId: e.ledgerId, side: e.debit ? 'debit' : 'credit', amount: String(e.debit || e.credit) })));
      }
    }).catch(setError);
  }, [fromId, org.id, type]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const ledgers = masters.data?.ledgers ?? [];
  const itemMap = useMemo(() => new Map((masters.data?.items ?? []).map((i) => [i.id, i])), [masters.data]);
  const parties = ledgers.filter((l) => ['sundry_debtors', 'sundry_creditors', 'cash_in_hand', 'bank_accounts'].includes(l.groupCode));
  const cashBank = ledgers.filter((l) => CASH_BANK.includes(l.groupCode));
  const party = ledgers.find((l) => l.id === head.partyLedgerId);
  const pos = head.placeOfSupply || party?.stateCode || org.stateCode;
  const gstOn = Boolean(org.gstin);
  const inter = gstOn && org.stateCode && pos && org.stateCode !== pos;

  const preview = items.map((l) => previewLine(l, itemMap.get(l.stockItemId), gstOn, inter));
  const taxable = preview.reduce((a, p) => a + p.taxable, 0);
  const tax = preview.reduce((a, p) => a + p.tax, 0);
  const exact = Math.round((taxable + tax) * 100) / 100;
  const rounded = Math.round(exact);

  const setItem = (i, k, v) => setItems(items.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [k]: v };
    if (k === 'stockItemId') {
      const it = itemMap.get(v);
      if (it) n.rate = String(type === 'purchase' || type === 'debit_note' ? it.purchasePrice : it.salePrice);
    }
    return n;
  }));
  const setEntry = (i, k, v) => setEntries(entries.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const dr = entries.filter((e) => e.side === 'debit').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const cr = entries.filter((e) => e.side === 'credit').reduce((a, e) => a + (Number(e.amount) || 0), 0);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    const body = { type, date: head.date, reference: head.reference, narration: head.narration, ...(original ? { replacesVoucherId: original.id } : {}) };
    if (isItem) {
      body.partyLedgerId = head.partyLedgerId || null;
      if (head.placeOfSupply) body.placeOfSupply = head.placeOfSupply;
      body.items = items.filter((l) => l.stockItemId).map((l) => (isAdj
        ? { stockItemId: l.stockItemId, qty: l.qty, direction: l.direction || 'out' }
        : { stockItemId: l.stockItemId, qty: l.qty, rate: l.rate || '0', discount: l.discount || '0', ...(l.gstRate !== '' ? { gstRate: l.gstRate } : {}) }));
    } else if (mode === 'simple' && (type === 'receipt' || type === 'payment')) {
      const cb = { ledgerId: simple.cashBankLedgerId, [type === 'receipt' ? 'debit' : 'credit']: simple.amount };
      const pt = { ledgerId: simple.partyLedgerId, [type === 'receipt' ? 'credit' : 'debit']: simple.amount };
      body.entries = [cb, pt];
    } else {
      body.entries = entries.filter((x) => x.ledgerId && x.amount).map((x) => ({ ledgerId: x.ledgerId, [x.side]: x.amount }));
    }
    try {
      const v = await api(`/orgs/${org.id}/vouchers`, { method: 'POST', body });
      router.push(`${base}/vouchers/${v.id}`);
    } catch (err) { setError(err); setBusy(false); }
  }

  if (!allowed.length) return <ErrorNote error={new Error('Your role cannot create vouchers.')} />;
  if (masters.loading && !masters.data) return <Loading />;

  const ledgerOptions = (list) => list.map((l) => <option key={l.id} value={l.id}>{l.name}</option>);
  const simpleMode = !isItem && (type === 'receipt' || type === 'payment') && mode === 'simple';

  return (
    <form onSubmit={submit}>
      <PageHead title={original ? `Correct ${original.label}` : `New ${VOUCHER_TYPES[type]}`} />
      {original && <div className="note note-warn">You are correcting <b>{original.label}</b>. Saving creates a new voucher and cancels the original (it stays on record, marked as replaced).</div>}
      <div className="chips">
        {allowed.map((t) => <Link key={t} className={`chip ${t === type ? 'active' : ''}`} href={`${base}/vouchers/new?type=${t}`} replace>{VOUCHER_TYPES[t]}</Link>)}
      </div>
      <ErrorNote error={masters.error || error} />
      {type === 'purchase' && can('voucher.create.purchase') && on('ocr') && (
        <ScanInvoice orgId={org.id} units={masters.data?.units ?? []} items={masters.data?.items ?? []} ledgers={ledgers}
          onApply={(d) => {
            setHead({ ...head, partyLedgerId: d.partyLedgerId, reference: d.reference, narration: d.narration, date: d.date || head.date });
            if (d.items.length) setItems(d.items);
            masters.reload();
          }} />
      )}
      <div className="card grid grid-3">
        <Field label="Date"><input type="date" required value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></Field>
        {isItem && !isAdj && (
          <Field label={type === 'sales' || type === 'credit_note' ? 'Customer' : 'Supplier'} hint="Leave as Cash for a cash bill.">
            <select value={head.partyLedgerId} onChange={(e) => setHead({ ...head, partyLedgerId: e.target.value })}>
              <option value="">Cash</option>{ledgerOptions(parties.filter((p) => p.groupCode !== 'cash_in_hand'))}
            </select>
          </Field>
        )}
        {isItem && !isAdj && gstOn && (
          <Field label="Place of supply" hint={inter ? 'Inter-state: IGST' : 'Same state: CGST + SGST'}>
            <select value={head.placeOfSupply} onChange={(e) => setHead({ ...head, placeOfSupply: e.target.value })}>
              <option value="">{pos ? `Auto (${pos})` : 'Auto'}</option>
              {STATE_LIST.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
            </select>
          </Field>
        )}
        <Field label="Reference / bill no."><input maxLength={80} value={head.reference} onChange={(e) => setHead({ ...head, reference: e.target.value })} /></Field>
      </div>

      {isItem && (
        <div className="card">
          <h2>Items</h2>
          {isAdj && <p className="muted" style={{ fontSize: 13 }}>Use <b>Out</b> for damaged, expired, lost or given-away stock, <b>In</b> for stock found or received free.
            Valued at cost; the effect shows in Profit &amp; Loss through closing stock.</p>}
          {itemMap.size === 0 && <p className="note note-warn">No stock items yet. <Link href={`${base}/items`}>Add items</Link> first.</p>}
          <div className="lines">
            {items.map((l, i) => (
              <div className="line" key={i}>
                <Field label="Item"><select required value={l.stockItemId} onChange={(e) => setItem(i, 'stockItemId', e.target.value)}>
                  <option value="">Choose…</option>{[...itemMap.values()].map((it) => <option key={it.id} value={it.id}>{it.name}{it.stockQty !== undefined ? ` (${it.stockQty} ${it.unitSymbol})` : ''}</option>)}
                </select></Field>
                <Field label={`Qty${itemMap.get(l.stockItemId) ? ` (${itemMap.get(l.stockItemId).unitSymbol})` : ''}`}><input inputMode="decimal" required value={l.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></Field>
                {isAdj ? (<>
                  <Field label="In / out"><select value={l.direction || 'out'} onChange={(e) => setItem(i, 'direction', e.target.value)}>
                    <option value="out">Out (reduce stock)</option><option value="in">In (add stock)</option></select></Field>
                  <span /><span />
                </>) : (<>
                <Field label="Rate"><input inputMode="decimal" required value={l.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} /></Field>
                <Field label="Discount ₹"><input inputMode="decimal" value={l.discount} onChange={(e) => setItem(i, 'discount', e.target.value)} placeholder="0" /></Field>
                <Field label="GST %"><input inputMode="decimal" disabled={!gstOn} value={l.gstRate} onChange={(e) => setItem(i, 'gstRate', e.target.value)} placeholder={gstOn ? String(itemMap.get(l.stockItemId)?.gstRate ?? 0) : '0'} /></Field>
                </>)}
                <button type="button" className="btn btn-sm btn-danger" aria-label="Remove line" onClick={() => setItems(items.length > 1 ? items.filter((_, j) => j !== i) : items)}>✕</button>
                {!isAdj && <div className="line-total">Taxable {money(preview[i].taxable)}{gstOn ? ` · GST ${money(preview[i].tax)}` : ''}</div>}
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-sm" onClick={() => setItems([...items, { stockItemId: '', qty: '1', rate: '', discount: '', gstRate: '' }])}>+ Add item</button>
          </div>
          {!isAdj && <div className="totals" style={{ marginTop: 12 }}>
            <div><span>Taxable value</span><span className="num">{money(taxable)}</span></div>
            {gstOn && (inter ? <div><span>IGST</span><span className="num">{money(tax)}</span></div> : <>
              <div><span>CGST</span><span className="num">{money(tax / 2)}</span></div><div><span>SGST</span><span className="num">{money(tax / 2)}</span></div></>)}
            <div><span>Round off</span><span className="num">{money(rounded - exact)}</span></div>
            <div className="grand"><span>Total</span><span className="num">{money(rounded)}</span></div>
          </div>}
        </div>
      )}

      {!isItem && (
        <div className="card">
          {(type === 'receipt' || type === 'payment') && (
            <div className="chips"><button type="button" className={`chip ${mode === 'simple' ? 'active' : ''}`} onClick={() => setMode('simple')}>Simple</button>
              <button type="button" className={`chip ${mode === 'advanced' ? 'active' : ''}`} onClick={() => setMode('advanced')}>Debit / credit lines</button></div>
          )}
          {simpleMode ? (
            <div className="grid grid-3">
              <Field label={type === 'receipt' ? 'Received from' : 'Paid to / expense'}>
                <select required value={simple.partyLedgerId} onChange={(e) => setSimple({ ...simple, partyLedgerId: e.target.value })}>
                  <option value="">Choose…</option>{ledgerOptions(ledgers.filter((l) => !CASH_BANK.includes(l.groupCode)))}
                </select>
              </Field>
              <Field label={type === 'receipt' ? 'Into (cash / bank)' : 'From (cash / bank)'}>
                <select required value={simple.cashBankLedgerId} onChange={(e) => setSimple({ ...simple, cashBankLedgerId: e.target.value })}>
                  <option value="">Choose…</option>{ledgerOptions(cashBank)}
                </select>
              </Field>
              <Field label="Amount ₹"><input inputMode="decimal" required value={simple.amount} onChange={(e) => setSimple({ ...simple, amount: e.target.value })} /></Field>
            </div>
          ) : (
            <>
              <div className="lines">
                {entries.map((x, i) => (
                  <div className="line line-entry" key={i}>
                    <Field label="Ledger"><select required value={x.ledgerId} onChange={(e) => setEntry(i, 'ledgerId', e.target.value)}>
                      <option value="">Choose…</option>{ledgerOptions(type === 'contra' ? cashBank : ledgers)}</select></Field>
                    <Field label="Dr / Cr"><select value={x.side} onChange={(e) => setEntry(i, 'side', e.target.value)}><option value="debit">Debit</option><option value="credit">Credit</option></select></Field>
                    <Field label="Amount ₹"><input inputMode="decimal" required value={x.amount} onChange={(e) => setEntry(i, 'amount', e.target.value)} /></Field>
                    <button type="button" className="btn btn-sm btn-danger" aria-label="Remove line" onClick={() => setEntries(entries.length > 2 ? entries.filter((_, j) => j !== i) : entries)}>✕</button>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-sm" onClick={() => setEntries([...entries, { ledgerId: '', side: dr > cr ? 'credit' : 'debit', amount: Math.abs(dr - cr) ? String(Math.round(Math.abs(dr - cr) * 100) / 100) : '' }])}>+ Add line</button>
                <span className="spacer" />
                <span className={Math.abs(dr - cr) < 0.005 ? 'badge' : 'badge badge-warn'}>Dr {money(dr)} · Cr {money(cr)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card grid">
        <Field label={isAdj ? 'Reason (required)' : 'Narration'}><textarea maxLength={1000} required={isAdj} value={head.narration} onChange={(e) => setHead({ ...head, narration: e.target.value })} /></Field>
        <div className="row"><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <Link className="btn" href={`${base}/vouchers`}>Cancel</Link></div>
      </div>
    </form>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><VoucherForm /></Suspense>;
}
