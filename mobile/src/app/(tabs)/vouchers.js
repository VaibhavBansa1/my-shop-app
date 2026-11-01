import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { date, money, VOUCHER_TYPES } from '../../lib/format.js';
import { Chips, ErrorNote, Loading, Row, Screen, T } from '../../components/ui.js';

const FILTERS = [['', 'All'], ['sales', 'Sales'], ['purchase', 'Purchase'], ['receipt', 'Receipts'], ['payment', 'Payments']];

export default function Vouchers() {
  const s = useSession();
  const [type, setType] = useState('');
  const list = useLoad(() => api.get(`/orgs/${s.org.id}/vouchers`, { type, limit: 200 }), [s.org.id, type]);
  useFocusEffect(useCallback(() => { list.reload(); }, [list.reload]));
  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: 14 }}
        data={list.data?.vouchers ?? []}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={list.loading && !!list.data} onRefresh={list.reload} />}
        ListHeaderComponent={<View><Chips options={FILTERS} value={type} onChange={setType} /><ErrorNote error={list.error} /></View>}
        ListEmptyComponent={list.loading ? <Loading /> : <T muted style={{ textAlign: 'center', padding: 20 }}>No vouchers yet.</T>}
        renderItem={({ item: v }) => (
          <Row title={`${v.label}${v.status === 'cancelled' ? ' · cancelled' : ''}`} subtitle={`${date(v.date)} · ${VOUCHER_TYPES[v.type]}${v.partyName ? ` · ${v.partyName}` : ''}`}
            right={money(v.total)} onPress={() => router.push(`/voucher/${v.id}`)} />
        )}
      />
    </Screen>
  );
}
