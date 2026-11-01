import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { signup } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { Button, Card, ErrorNote, Field, Screen, T } from '../components/ui.js';

export default function Signup() {
  const session = useSession();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  async function submit() {
    setBusy(true); setError(null);
    try {
      await signup(f.name.trim(), f.email.trim().toLowerCase(), f.password);
      await session.refresh();
      router.replace('/');
    } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Card>
          <ErrorNote error={error} />
          <Field label="Your name" value={f.name} onChangeText={set('name')} autoComplete="name" maxLength={120} />
          <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password"
            hint="At least 10 characters. A short sentence works well." />
          <Button title="Create account" onPress={submit} busy={busy} disabled={!f.name || !f.email || f.password.length < 10} />
        </Card>
        <T muted small>After this you can create your business, or ask your employer to invite this email.</T>
      </ScrollView>
    </Screen>
  );
}
