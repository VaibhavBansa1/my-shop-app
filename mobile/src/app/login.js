import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { Link, router } from 'expo-router';
import { login } from '../lib/api.js';
import { getServerUrl } from '../lib/config.js';
import { useSession } from '../lib/session.js';
import { Button, Card, ErrorNote, Field, Screen, T } from '../components/ui.js';

export default function Login() {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [server, setServer] = useState('');
  useEffect(() => { getServerUrl().then(setServer); }, []);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await login(email.trim().toLowerCase(), password, needCode ? code.trim() : undefined);
      await session.refresh();
      router.replace('/');
    } catch (e) {
      if (e.code === 'mfa_required') { setNeedCode(true); setError(null); } else setError(e);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <T h1 style={{ marginBottom: 4 }}>My Shop</T>
          <T muted style={{ marginBottom: 16 }}>Billing, stock and accounts for your shop.</T>
          <Card>
            <ErrorNote error={error} />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
            {needCode && <Field label="Code from your authenticator app" value={code} onChangeText={setCode} autoCapitalize="none"
              autoComplete="one-time-code" textContentType="oneTimeCode" hint="6 digits, or one of your recovery codes" onSubmitEditing={submit} />}
            <Button title="Sign in" onPress={submit} busy={busy} disabled={!email || !password || (needCode && !code)} />
          </Card>
          <View style={{ alignItems: 'center', gap: 14, marginTop: 8 }}>
            <Link href="/signup"><T style={{ fontWeight: '700' }}>New here? Create an account</T></Link>
            {server ? <T muted onPress={() => Linking.openURL(`${server}/forgot`)} accessibilityRole="link">Forgot password?</T> : null}
            <Link href="/server"><T muted small>Server: {server || 'not set'} · change</T></Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
