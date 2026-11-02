import { Linking, ScrollView } from 'react-native';
import { getServerUrl } from '../../lib/config.js';
import { router } from 'expo-router';
import { useSession } from '../../lib/session.js';
import { ROLE_LABEL } from '../../lib/format.js';
import { Card, Row, Screen, T } from '../../components/ui.js';

export default function More() {
  const s = useSession();
  const go = (pathname, params) => () => router.push(params ? { pathname, params } : pathname);
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }}>
        <Card>
          <T h2>{s.org.name}</T>
          <T muted>{s.user.name} · {ROLE_LABEL[s.org.role]}</T>
        </Card>
        <Card>
          <Row title="🔔 Notifications" subtitle="Cancelled bills, low stock, new members, daily summary" right="›" onPress={go('/notifications')} />
          {s.can('voucher.create.receipt') && <Row title="Receive money" subtitle="From a customer" right="›" onPress={go('/entry', { type: 'receipt' })} />}
          {s.can('voucher.create.payment') && <Row title="Pay / expense" subtitle="Rent, salary, supplier payment…" right="›" onPress={go('/entry', { type: 'payment' })} />}
          {s.can('voucher.create.purchase') && s.on('ocr') && <Row title="Scan purchase invoice" subtitle="Read a supplier bill with the camera" right="›" onPress={go('/scan')} />}
          <Row title="Customers & suppliers" right="›" onPress={go('/parties')} />
          <Row title="Reports" subtitle="Profit & loss, GST, dues, stock" right="›" onPress={go('/reports')} />
          {s.org.aiEnabled && s.on('ai') && <Row title="✨ Shop summary (AI)" subtitle="Plain-language summary in English, Hindi or Hinglish" right="›" onPress={go('/summary')} />}
        </Card>
        <Card>
          <Row title="Your account" subtitle="Name, password, devices, two-step login, email" right="›" onPress={go('/account')} />
          <Row title="Switch business" right="›" onPress={async () => { await s.clearOrg(); router.replace('/orgs'); }} />
          <Row title="Help & glossary" subtitle="What every word and field means" right="›" onPress={async () => Linking.openURL(`${await getServerUrl()}/help`)} />
          <Row title="Server" right="›" onPress={go('/server')} />
          <Row title="Sign out" danger onPress={async () => { await s.logout(); router.replace('/login'); }} />
        </Card>
        <T muted small style={{ textAlign: 'center' }}>Team, settings and the full set of masters are on the website.</T>
      </ScrollView>
    </Screen>
  );
}
