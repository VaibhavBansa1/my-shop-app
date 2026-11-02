import { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { money, qty } from '../../lib/format.js';
import { Button, Card, ErrorNote, Loading, Row, Screen, T } from '../../components/ui.js';

function Stat({ label, value }) {
  return <Card style={{ flex: 1, marginBottom: 0 }}><T muted small>{label}</T><T h2 style={{ marginTop: 2 }}>{value}</T></Card>;
}

export default function Home() {
  const s = useSession();
  const d = useLoad(() => api.get(`/orgs/${s.org.id}/reports/dashboard`), [s.org.id]);
  useFocusEffect(useCallback(() => { d.reload(); }, [d.reload]));
  const m = d.data?.month ?? {};
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} refreshControl={<RefreshControl refreshing={d.loading && !!d.data} onRefresh={d.reload} />}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {s.can('voucher.create.sales') && <Button title="+ Sale" onPress={() => router.push('/sell')} style={{ flex: 1 }} />}
          {s.can('voucher.create.receipt') && <Button kind="secondary" title="+ Receipt" onPress={() => router.push({ pathname: '/entry', params: { type: 'receipt' } })} style={{ flex: 1 }} />}
          {s.can('voucher.create.payment') && <Button kind="secondary" title="+ Expense" onPress={() => router.push({ pathname: '/entry', params: { type: 'payment' } })} style={{ flex: 1 }} />}
        </View>
        {s.can('voucher.create.purchase') && s.on('ocr') && <Button kind="secondary" title="📷 Scan a purchase invoice" onPress={() => router.push('/scan')} style={{ marginBottom: 12 }} />}
        <ErrorNote error={d.error} />
        {!d.data ? (d.loading ? <Loading /> : null) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <Stat label="Sales today" value={money(d.data.today.sales)} />
              <Stat label="This month" value={money(m.sales?.total ?? 0)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <Stat label="Cash & bank" value={money(d.data.cashAndBank)} />
              <Stat label="Stock value" value={money(d.data.stockValue)} />
            </View>
            <Card>
              <T h2 style={{ marginBottom: 4 }}>This month</T>
              <Row title="Sales" subtitle={`${m.sales?.count ?? 0} bills`} right={money(m.sales?.total ?? 0)} />
              <Row title="Purchases" subtitle={`${m.purchase?.count ?? 0}`} right={money(m.purchase?.total ?? 0)} />
              <Row title="Receipts" subtitle={`${m.receipt?.count ?? 0}`} right={money(m.receipt?.total ?? 0)} />
              <Row title="Payments" subtitle={`${m.payment?.count ?? 0}`} right={money(m.payment?.total ?? 0)} />
            </Card>
            <Card>
              <T h2 style={{ marginBottom: 4 }}>Low stock</T>
              {d.data.lowStock.length === 0 ? <T muted>Nothing is below its reorder level.</T>
                : d.data.lowStock.map((i) => <Row key={i.itemId} title={i.name} right={`${qty(i.qty)} ${i.unit}`} />)}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
