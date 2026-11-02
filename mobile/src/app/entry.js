// Receipt (money in) or payment/expense (money out): the two most common non-item entries.
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { api, newIdempotencyKey } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { today } from '../lib/format.js';
import { Button, Card, ErrorNote, Field, Loading, Picker, Screen } from '../components/ui.js';

const CASH_BANK = ['cash_in_hand', 'bank_accounts', 'bank_od'];

export default function Entry() {
  const { type: typeParam } = useLocalSearchParams();
  const type = typeParam === 'payment' ? 'payment' : 'receipt';
  const s = useSession();
  const ledgers = useLoad(() => api.get(`/orgs/${s.org.id}/ledgers`), [s.org.id]);
  const [party, setParty] = useState(null);
  const [cashBank, setCashBank] = useState(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  // Same key for retries of this Save; a new key after a successful save (no duplicate bills).
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!ledgers.data) return <Screen>{ledgers.loading ? <Loading /> : <ErrorNote error={ledgers.error} />}</Screen>;
  const all = ledgers.data.ledgers.filter((l) => l.isActive);
  const cb = all.filter((l) => CASH_BANK.includes(l.groupCode));
  const others = all.filter((l) => !CASH_BANK.includes(l.groupCode))
    .filter((l) => !['sales_accounts', 'purchase_accounts', 'duties_taxes'].includes(l.groupCode))
    // Most likely choices first: customers for receipts, expenses/suppliers for payments.
    .sort((a, b) => {
      const pri = (l) => (type === 'receipt' ? (l.groupCode === 'sundry_debtors' ? 0 : 1)
        : (l.groupCode === 'indirect_expenses' || l.groupCode === 'sundry_creditors' ? 0 : 1));
      return pri(a) - pri(b) || a.name.localeCompare(b.name);
    });
  const cashId = cb.find((l) => l.code === 'cash')?.id;

  async function save() {
    setBusy(true); setError(null);
    const into = cashBank ?? cashId;
    try {
      const v = await api.post(`/orgs/${s.org.id}/vouchers`, {
        type, date, narration,
        entries: type === 'receipt'
          ? [{ ledgerId: into, debit: amount }, { ledgerId: party, credit: amount }]
          : [{ ledgerId: party, debit: amount }, { ledgerId: into, credit: amount }],
      }, { 'idempotency-key': idemKey });
      router.replace(`/voucher/${v.id}`);
    } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: type === 'receipt' ? 'Receive money' : 'Pay / expense' }} />
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <ErrorNote error={error} />
        <Card>
          <Picker label={type === 'receipt' ? 'Received from' : 'Paid to / expense head'} value={party} onChange={setParty}
            options={others.map((l) => ({ value: l.id, label: l.name, sub: l.groupName }))} />
          <Picker label={type === 'receipt' ? 'Into' : 'From'} value={cashBank ?? cashId} onChange={setCashBank}
            options={cb.map((l) => ({ value: l.id, label: l.name }))} />
          <Field label="Amount ₹" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" maxLength={10} />
          <Field label="Note" value={narration} onChangeText={setNarration} maxLength={1000} />
          <Button title="Save" onPress={save} busy={busy} disabled={!party || !(Number(amount) > 0)} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
