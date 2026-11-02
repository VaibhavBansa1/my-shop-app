import { FlatList, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { amount, date, VOUCHER_TYPES } from '../../lib/format.js';
import { Button, Card, ErrorNote, Loading, Row, Screen, T } from '../../components/ui.js';

const drcr = (n) => `${amount(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;

export default function LedgerScreen() {
  const { id } = useLocalSearchParams();
  const s = useSession();
  const st = useLoad(() => api.get(`/orgs/${s.org.id}/reports/ledger`, { ledger: id }), [s.org.id, id]);
  return (
    <Screen>
      <Stack.Screen options={{ title: st.data?.ledger ?? 'Ledger' }} />
      <FlatList contentContainerStyle={{ padding: 14 }} data={st.data?.lines ?? []} keyExtractor={(l, i) => `${l.voucherId}-${i}`}
        ListHeaderComponent={<View><ErrorNote error={st.error} />{st.data && (
          <Card><T muted>Opening {drcr(st.data.opening)}</T><T h2>Balance {drcr(st.data.closing)}</T>
            <T muted small>{st.data.closing > 0 ? 'They owe you (Dr)' : st.data.closing < 0 ? 'You owe them (Cr)' : 'Settled'}</T>
            {st.data.closing > 0 && s.can('reminders.send') && s.on('reminders') && <Button small title="Send payment reminder" onPress={() => router.push(`/remind/${id}`)} style={{ marginTop: 10 }} />}
          </Card>)}</View>}
        ListEmptyComponent={st.loading ? <Loading /> : <T muted style={{ textAlign: 'center', padding: 20 }}>No entries.</T>}
        renderItem={({ item: l }) => (
          <Row title={`${l.label} · ${VOUCHER_TYPES[l.type]}`} subtitle={`${date(l.date)} · bal ${drcr(l.balance)}`}
            right={l.debit ? `Dr ${amount(l.debit)}` : `Cr ${amount(l.credit)}`} onPress={() => router.push(`/voucher/${l.voucherId}`)} />
        )} />
    </Screen>
  );
}
