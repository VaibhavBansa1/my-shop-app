import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSession } from '../../lib/session.js';
import { Loading, Screen, useTheme } from '../../components/ui.js';

const icon = (glyph) => ({ color }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const s = useSession();
  const t = useTheme();
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
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
