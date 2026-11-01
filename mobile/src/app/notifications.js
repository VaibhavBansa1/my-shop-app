import { useCallback } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { Button, ErrorNote, Loading, Row, Screen, T } from '../components/ui.js';

// Only these in-app links are followed (the server also restricts links to app paths).
function route(link) {
  const m = link?.match(/^\/vouchers\/([0-9a-f-]{36})$/);
  if (m) return `/voucher/${m[1]}`;
  if (link === '/items') return '/stock';
  if (link === '/reports') return '/reports';
  return null;
}

export default function Notifications() {
  const s = useSession();
  const list = useLoad(() => api.get(`/orgs/${s.org.id}/notifications`, { limit: 100 }), [s.org.id]);
  useFocusEffect(useCallback(() => { list.reload(); }, [list.reload]));
  async function open(n) {
    if (!n.read) await api.post(`/orgs/${s.org.id}/notifications/read`, { ids: [n.id] }).catch(() => {});
    const to = route(n.link);
    if (to) router.push(to); else list.reload();
  }
  return (
    <Screen>
      <FlatList contentContainerStyle={{ padding: 14 }} data={list.data?.notifications ?? []} keyExtractor={(n) => String(n.id)}
        ListHeaderComponent={<View>
          <ErrorNote error={list.error} />
          {list.data?.unread > 0 && <Button small kind="secondary" title="Mark all read" style={{ marginBottom: 10 }}
            onPress={async () => { await api.post(`/orgs/${s.org.id}/notifications/read`, { all: true }); list.reload(); }} />}
        </View>}
        ListEmptyComponent={list.loading ? <Loading /> : <T muted style={{ textAlign: 'center', padding: 20 }}>Nothing yet. You will be told here when a bill is cancelled, stock runs low, or someone joins.</T>}
        renderItem={({ item: n }) => (
          <Row title={`${n.read ? '' : '● '}${n.title}`} subtitle={`${n.body ? `${n.body}\n` : ''}${new Date(n.createdAt).toLocaleString('en-IN')}`} onPress={() => open(n)} />
        )} />
    </Screen>
  );
}
