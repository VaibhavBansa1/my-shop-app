import { Redirect } from 'expo-router';
import { useSession } from '../lib/session.js';
import { Loading, Screen } from '../components/ui.js';

export default function Index() {
  const s = useSession();
  if (!s.ready) return <Screen><Loading /></Screen>;
  if (!s.user) return <Redirect href="/login" />;
  if (!s.org) return <Redirect href="/orgs" />;
  return <Redirect href="/home" />;
}
