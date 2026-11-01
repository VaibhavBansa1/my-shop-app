import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { money, monthStart, qty, today } from '../lib/format.js';
import { Card, Chips, ErrorNote, Loading, Row, Screen, T, Totals } from '../components/ui.js';

const REPORTS = [['profit-loss', 'Profit & Loss'], ['receivable', 'Customers owe'], ['payable', 'You owe'], ['gst-summary', 'GST'], ['stock-summary', 'Stock']];
const PERIODS = [['month', 'This month'], ['fy', 'This year']];

function fyStartDate(org) {
  const t = today(); const m = org.fyStartMonth ?? 4;
  const y = Number(t.slice(5, 7)) >= m ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export default function Reports() {
  const s = useSession();
  const [id, setId] = useState('profit-loss');
  const [period, setPeriod] = useState('month');
  const from = period === 'month' ? monthStart() : fyStartDate(s.org);
  const path = id === 'receivable' || id === 'payable' ? 'outstanding' : id;
  const r = useLoad(async () => ({ id, d: await api.get(`/orgs/${s.org.id}/reports/${path}`,
    { from, to: today(), ...(path === 'outstanding' ? { kind: id } : {}) }) }), [s.org.id, id, from]);
  const d = r.data?.id === id ? r.data.d : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Chips options={REPORTS} value={id} onChange={setId} />
        {(id === 'profit-loss' || id === 'gst-summary') && <Chips options={PERIODS} value={period} onChange={setPeriod} />}
        <ErrorNote error={r.error} />
        {!d ? <Loading /> : (
          <Card>
            {id === 'profit-loss' && (<>
              {d.sections.map((sec) => <Row key={sec.group} title={sec.group} right={money(sec.amount)} />)}
              <Totals lines={[['Opening stock', money(d.openingStock)], ['Closing stock', money(d.closingStock)], ['Gross profit', money(d.grossProfit)],
                [d.netProfit >= 0 ? 'Net profit' : 'Net loss', money(Math.abs(d.netProfit)), true]]} />
            </>)}
            {path === 'outstanding' && (<>
              {d.parties.length === 0 && <T muted>Nothing outstanding.</T>}
              {d.parties.map((p) => <Row key={p.ledgerId} title={p.ledger} right={money(p.amount)} onPress={() => router.push(`/ledger/${p.ledgerId}`)} />)}
              <Totals lines={[['Total', money(d.total), true]]} />
            </>)}
            {id === 'gst-summary' && (
              <Totals lines={[['Sales taxable', money(d.outwardTotal.taxable)], ['Output tax', money(d.outputTax)],
                ['Purchase taxable', money(d.inwardTotal.taxable)], ['Input tax credit', money(d.inputTax)],
                [d.netPayable >= 0 ? 'Net GST payable' : 'Excess credit', money(Math.abs(d.netPayable)), true]]} />
            )}
            {id === 'stock-summary' && (<>
              {d.items.map((i) => <Row key={i.itemId} title={i.name} subtitle={`${qty(i.qty)} ${i.unit} @ ${money(i.avgCost)}`} right={money(i.value)} />)}
              <Totals lines={[['Stock value', money(d.totalValue), true]]} />
            </>)}
          </Card>
        )}
        <T muted small>Balance sheet, trial balance and day book are on the website.</T>
      </ScrollView>
    </Screen>
  );
}
