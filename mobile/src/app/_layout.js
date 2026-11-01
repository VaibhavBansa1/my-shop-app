import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../lib/session.js';
import { useTheme } from '../components/ui.js';

function Nav() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.ink, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="signup" options={{ title: 'Create account' }} />
        <Stack.Screen name="server" options={{ title: 'Server' }} />
        <Stack.Screen name="orgs" options={{ title: 'Your businesses' }} />
        <Stack.Screen name="voucher/[id]" options={{ title: 'Voucher' }} />
        <Stack.Screen name="entry" options={{ title: 'New entry' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan purchase invoice' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="parties" options={{ title: 'Customers & suppliers' }} />
        <Stack.Screen name="ledger/[id]" options={{ title: 'Ledger' }} />
        <Stack.Screen name="item-new" options={{ title: 'New stock item' }} />
        <Stack.Screen name="summary" options={{ title: 'Shop summary (AI)' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Nav />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
