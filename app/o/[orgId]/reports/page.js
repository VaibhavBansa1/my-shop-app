'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { money, amount, qty, date, today, monthStart, VOUCHER_TYPES } from '../../../ui/format.js';
import { downloadCsv, reportRows } from '../../../ui/download.js';

const REPORTS = [
  ['profit-loss', 'Profit & Loss', 'range'], ['balance-sheet', 'Balance Sheet', 'asof'], ['trial-balance', 'Trial Balance', 'asof'],
  ['day-book', 'Day Book', 'range'], ['stock-summary', 'Stock Summary', 'asof'], ['gst-summary', 'GST Summary', 'range'],
  ['outstanding', 'Receivables', 'asof', { kind: 'receivable' }], ['outstanding-pay', 'Payables', 'asof', { kind: 'payable' }],
];

function Sections({ list, base }) {
  return list.map((s) => (
    <tbody key={s.group}>
      <tr><td><b>{s.group}</b></td><td className="num"><b>{amount(s.amount)}</b></td></tr>
      {s.ledgers.map((l, i) => <tr key={i}><td style={{ paddingLeft: 22 }}>{l.ledgerId ? <Link href={`${base}/ledgers/${l.ledgerId}`}>{l.ledger}</Link> : l.ledger}</td><td className="num muted">{amount(l.amount)}</td></tr>)}
    </tbody>
  ));
}

function Body({ id, d, base }) {
  if (id === 'profit-loss') {
    const dir = d.sections.filter((s) => s.gross); const ind = d.sections.filter((s) => !s.gross);
    return (
      <table>
        <tbody><tr><td>Opening stock</td><td className="num">{amount(d.openingStock)}</td></tr></tbody>
        <Sections list={dir} base={base} />
        <tbody><tr><td>Closing stock</td><td className="num">{amount(d.closingStock)}</td></tr>
          <tr><td><b>Gross profit</b></td><td className="num"><b>{money(d.grossProfit)}</b></td></tr></tbody>
        <Sections list={ind} base={base} />
        <tfoot><tr><td>{d.netProfit >= 0 ? 'Net profit' : 'Net loss'}</td><td className="num">{money(Math.abs(d.netProfit))}</td></tr></tfoot>
      </table>
    );
  }
  if (id === 'balance-sheet') return (<>
    <div className="grid grid-2">
      <div><h2>Liabilities</h2><table><Sections list={d.liabilities} base={base} /><tfoot><tr><td>Total</td><td className="num">{money(d.totalLiabilities)}</td></tr></tfoot></table></div>
      <div><h2>Assets</h2><table><Sections list={d.assets} base={base} /><tfoot><tr><td>Total</td><td className="num">{money(d.totalAssets)}</td></tr></tfoot></table></div>
    </div>
    {d.liabilities.some((s) => s.group.startsWith('Difference')) && (
      <p className="note note-warn" style={{ gridColumn: '1 / -1' }}>Your opening balances (including opening stock) do not add up to zero.
        Usually this means the owner’s capital has not been entered yet: open the <b>Capital</b> ledger and set its opening balance (Credit) to this difference.</p>
    )}
  </>);
  if (id === 'trial-balance') return (
    <table><thead><tr><th>Ledger</th><th>Group</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
      <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.ledgerId ? <Link href={`${base}/ledgers/${r.ledgerId}`}>{r.ledger}</Link> : r.ledger}</td><td className="muted">{r.group}</td><td className="num">{r.debit ? amount(r.debit) : ''}</td><td className="num">{r.credit ? amount(r.credit) : ''}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={2}>Total{d.differenceInOpening ? ` (difference in opening ${amount(d.differenceInOpening)})` : ''}</td><td className="num">{amount(d.totalDebit)}</td><td className="num">{amount(d.totalCredit)}</td></tr></tfoot></table>
  );
  if (id === 'day-book') return (
    <table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Party</th><th className="num">Amount</th></tr></thead>
      <tbody>{d.vouchers.map((v) => <tr key={v.voucherId} className={v.status === 'cancelled' ? 'strike' : ''}><td>{date(v.date)}</td><td><Link href={`${base}/vouchers/${v.voucherId}`}>{v.label}</Link></td><td>{VOUCHER_TYPES[v.type]}</td><td>{v.party}</td><td className="num">{amount(v.total)}</td></tr>)}</tbody></table>
  );
  if (id === 'stock-summary') return (
    <table><thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Avg cost</th><th className="num">Value</th></tr></thead>
      <tbody>{d.items.map((i) => <tr key={i.itemId}><td>{i.name}{i.low && <> <span className="badge badge-warn">Low</span></>}</td><td className="num">{qty(i.qty)} {i.unit}</td><td className="num">{amount(i.avgCost)}</td><td className="num">{amount(i.value)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>Total stock value</td><td className="num">{money(d.totalValue)}</td></tr></tfoot></table>
  );
  if (id === 'gst-summary') {
    const T = ({ rows, total, title }) => (
      <><h2 style={{ marginTop: 8 }}>{title}</h2><table><thead><tr><th className="num">Rate</th><th className="num">Taxable</th><th className="num">CGST</th><th className="num">SGST</th><th className="num">IGST</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.rate}><td className="num">{r.rate}%</td><td className="num">{amount(r.taxable)}</td><td className="num">{amount(r.cgst)}</td><td className="num">{amount(r.sgst)}</td><td className="num">{amount(r.igst)}</td></tr>)}</tbody>
        <tfoot><tr><td>Total</td><td className="num">{amount(total.taxable)}</td><td className="num">{amount(total.cgst)}</td><td className="num">{amount(total.sgst)}</td><td className="num">{amount(total.igst)}</td></tr></tfoot></table></>
    );
    return (<>
      <T rows={d.outward} total={d.outwardTotal} title="Outward supplies (sales less credit notes)" />
      <T rows={d.inward} total={d.inwardTotal} title="Inward supplies (purchases less debit notes)" />
      <div className="totals" style={{ marginTop: 12 }}><div><span>Output tax</span><span className="num">{money(d.outputTax)}</span></div>
        <div><span>Input tax credit</span><span className="num">{money(d.inputTax)}</span></div>
        <div className="grand"><span>{d.netPayable >= 0 ? 'Net GST payable' : 'Excess input credit'}</span><span className="num">{money(Math.abs(d.netPayable))}</span></div></div>
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>A working summary to help with GSTR-1 / GSTR-3B. Check with your accountant before filing.</p>
    </>);
  }
  if (id.startsWith('outstanding')) return (
    <table><thead><tr><th>Party</th><th className="num">{d.kind === 'payable' ? 'You owe' : 'Owes you'}</th>{d.kind !== 'payable' && <th className="no-print"></th>}</tr></thead>
      <tbody>{d.parties.map((p) => <tr key={p.ledgerId}><td><Link href={`${base}/ledgers/${p.ledgerId}`}>{p.ledger}</Link></td><td className="num">{amount(p.amount)}</td>
        {d.kind !== 'payable' && <td className="num no-print">{p.amount > 0 && <Link className="btn btn-sm" href={`${base}/remind/${p.ledgerId}`}>Remind</Link>}</td>}</tr>)}</tbody>
      <tfoot><tr><td>Total</td><td className="num">{money(d.total)}</td>{d.kind !== 'payable' && <td />}</tr></tfoot></table>
  );
  return null;
}

export default function Reports() {
  const { org, base } = useOrg();
  const [id, setId] = useState('profit-loss');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const r = REPORTS.find((x) => x[0] === id);
  const path = id.startsWith('outstanding') ? 'outstanding' : id;
  // Tag results with the report id so a stale result is never drawn with another report's layout.
  const data = useApi(async () => ({ id, d: await api(`/orgs/${org.id}/reports/${path}`, { query: { ...(r[2] === 'range' ? { from } : {}), to, ...(r[3] ?? {}) } }) }), [org.id, id, from, to]);
  const current = data.data?.id === id ? data.data.d : null;
  return (
    <>
      <PageHead title={r[1]} sub={r[2] === 'range' ? `${date(from)} to ${date(to)}` : `As on ${date(to)}`} actions={<>
        <button className="btn no-print" disabled={!current} onClick={() => downloadCsv(`${org.name}-${r[1]}-${to}.csv`, reportRows(id, current))}>Download CSV</button>
        <button className="btn no-print" onClick={() => window.print()}>Print</button></>} />
      <div className="chips no-print">{REPORTS.map(([k, label]) => <button key={k} className={`chip ${id === k ? 'active' : ''}`} onClick={() => setId(k)}>{label}</button>)}</div>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        {r[2] === 'range' && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 170 }} aria-label="From" /><span className="muted">to</span></>}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 170 }} aria-label={r[2] === 'range' ? 'To' : 'As on'} />
      </div>
      <div className="card">
        <ErrorNote error={data.error} />
        {!current ? (!data.error && <Loading />) : <div className="table-wrap"><Body id={id} d={current} base={base} /></div>}
      </div>
    </>
  );
}
