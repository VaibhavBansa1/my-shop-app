import { useEffect, useState } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { api } from '../../lib/api.js';
import { Text } from 'react-native';
import { useSession } from '../../lib/session.js';
import { Loading, Screen, useTheme } from '../../components/ui.js';

const icon = (glyph) => ({ color }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const s = useSession();
  const t = useTheme();
  // Unread notifications badge on the More tab (refreshed every minute).
  const [unread, setUnread] = useState(0);
  const orgId = s.org?.id;
  useEffect(() => {
    if (!orgId) return undefined;
    let alive = true;
    const load = () => api.get(`/orgs/${orgId}/notifications`, { unread: 1, limit: 1 }).then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, [orgId]);
  if (!s.ready) return <Screen><Loading /></Screen>;
  if (!s.user) return <Redirect href="/login" />;
  if (!s.org) return <Redirect href="/orgs" />;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: t.brand, tabBarInactiveTintColor: t.muted,
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      headerStyle: { backgroundColor: t.surface }, headerTintColor: t.ink, sceneStyle: { backgroundColor: t.bg },
    }}>
      <Tabs.Screen name="home" options={{ title: s.org.name, tabBarLabel: 'Home', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="sell" options={{ title: 'New sale', tabBarLabel: 'Sell', tabBarIcon: icon('＋'), href: s.can('voucher.create.sales') ? undefined : null }} />
      <Tabs.Screen name="vouchers" options={{ title: 'Vouchers', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('⋯'), tabBarBadge: unread > 0 ? unread : undefined }} />
    </Tabs>
  );
}
