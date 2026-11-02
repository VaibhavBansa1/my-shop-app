import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';
import { Image } from 'expo-image';
import { api } from '../../lib/api.js';
import { absUrl } from '../../lib/images.js';
import { useLoad, useSession } from '../../lib/session.js';
import { money, qty } from '../../lib/format.js';
import { Button, Chips, ErrorNote, Loading, Row, Screen, T, useTheme } from '../../components/ui.js';

export default function Stock() {
  const s = useSession();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const list = useLoad(() => api.get(`/orgs/${s.org.id}/items`), [s.org.id]);
  // Refresh when coming back (e.g. after adding an item or a sale).
  useFocusEffect(useCallback(() => { list.reload(); }, [list.reload]));
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data?.items ?? []).filter((i) => (!needle || `${i.name} ${i.sku}`.toLowerCase().includes(needle))
      && (filter === 'all' || i.stockQty <= i.reorderLevel));
  }, [list.data, q, filter]);
  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: 14 }}
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={list.loading && !!list.data} onRefresh={list.reload} />}
        ListHeaderComponent={<View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search items…" placeholderTextColor={t.muted}
            style={{ minHeight: 44, borderWidth: 1, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, color: t.ink, backgroundColor: t.surface, marginBottom: 10 }} />
          <Chips options={[['all', 'All items'], ['low', 'Low stock']]} value={filter} onChange={setFilter} />
          {s.can('masters.write') && <Button kind="secondary" title="+ New item" onPress={() => router.push('/item-new')} style={{ marginBottom: 10 }} />}
          <ErrorNote error={list.error} />
        </View>}
        ListEmptyComponent={list.loading ? <Loading /> : <T muted style={{ textAlign: 'center', padding: 20 }}>No items.</T>}
        renderItem={({ item: i }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* expo-image caches in memory and on disk, so lists scroll fast and do not re-download */}
            <Image source={absUrl(i.image?.thumb)} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: t.line }}
              cachePolicy="memory-disk" recyclingKey={i.id} transition={120} accessibilityIgnoresInvertColors />
            <View style={{ flex: 1 }}>
              <Row title={i.name} subtitle={`${money(i.salePrice)} · GST ${i.gstRate}%${i.hsnCode ? ` · HSN ${i.hsnCode}` : ''}`}
                right={<T bold style={{ color: i.stockQty <= i.reorderLevel ? t.warn : t.ink }}>{qty(i.stockQty)} {i.unitSymbol}</T>} />
            </View>
          </View>
        )}
      />
    </Screen>
  );
}
