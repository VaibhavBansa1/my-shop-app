// Your account on the phone: name, password, two-step login status, sign-in email, devices, delete account.
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { api, clearToken } from '../lib/api.js';
import { getServerUrl } from '../lib/config.js';
import { useLoad, useSession } from '../lib/session.js';
import { Button, Card, ErrorNote, Field, Note, Row, Screen, T } from '../components/ui.js';

export default function Account() {
  const s = useSession();
  const me = useLoad(() => api.get('/me'), []);
  const sessions = useLoad(() => api.get('/me/sessions'), []);
  const tf = useLoad(() => api.get('/me/two-factor'), []);
  const [name, setName] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [em, setEm] = useState({ newEmail: '', password: '', code: '' });
  const [del, setDel] = useState({ password: '', code: '', confirm: '' });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const u = me.data?.user;
  const mfa = Boolean(u?.mfa);
  async function run(key, fn, ok) {
    setBusy(key); setError(null); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setError(e); } finally { setBusy(null); }
  }
  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
          <ErrorNote error={error || me.error} />{msg ? <Note kind="ok">{msg}</Note> : null}
          {u && (<Card>
            <T h2>Your name</T>
            <Field label="Name" value={name ?? u.name} onChangeText={setName} maxLength={120} />
            <Button title="Save name" kind="secondary" busy={busy === 'name'} onPress={() => run('name', async () => { await api.patch('/me', { name: (name ?? u.name).trim() }); me.reload(); s.refresh?.(); }, 'Name saved.')} />
          </Card>)}

          <Card>
            <T h2>Password</T>
            <Field label="Current password" value={pw.currentPassword} onChangeText={(v) => setPw({ ...pw, currentPassword: v })} secureTextEntry autoComplete="current-password" />
            <Field label="New password" hint="At least 10 characters. A short sentence works well." value={pw.newPassword} onChangeText={(v) => setPw({ ...pw, newPassword: v })} secureTextEntry autoComplete="new-password" />
            <Button title="Change password" busy={busy === 'pw'} disabled={!pw.currentPassword || pw.newPassword.length < 10}
              onPress={() => run('pw', async () => { await api.post('/auth/password', pw); setPw({ currentPassword: '', newPassword: '' }); sessions.reload(); }, 'Password changed. Your other devices were signed out.')} />
          </Card>

          <Card>
            <T h2>Two-step login</T>
            {tf.data?.enabled
              ? <T>On · {tf.data.recoveryCodesLeft} recovery codes left</T>
              : <T muted>Off. Turn it on so a stolen password is not enough to get in. Set it up on the website (Settings → Two-step login), using an authenticator app on this phone.</T>}
            <Button title="Open settings on the website" kind="secondary" small onPress={async () => Linking.openURL(`${await getServerUrl()}/o/${s.org?.id ?? ''}/settings#two-step`)} />
          </Card>

          <Card>
            <T h2>Where you are signed in</T>
            {(sessions.data?.sessions ?? []).map((x) => (
              <Row key={x.id} title={(x.device || 'Unknown device').slice(0, 60) + (x.current ? '  (this phone)' : '')}
                subtitle={`${x.ip && x.ip !== 'unknown' ? `${x.ip} · ` : ''}last active ${new Date(x.lastSeenAt).toLocaleString('en-IN')}`}
                right={x.current ? '' : 'Sign out'} danger={!x.current}
                onPress={x.current ? undefined : () => run('dev', async () => { await api.del(`/me/sessions/${x.id}`); sessions.reload(); }, 'Device signed out.')} />
            ))}
            {(sessions.data?.sessions?.length ?? 0) > 1 && <Button title="Sign out all other devices" kind="secondary" small busy={busy === 'all'}
              onPress={() => run('all', async () => { await api.del('/me/sessions'); sessions.reload(); }, 'Signed out of all other devices.')} />}
          </Card>

          {u && (<Card>
            <T h2>Sign-in email</T>
            <T muted>{u.email}</T>
            <Field label="New email" value={em.newEmail} onChangeText={(v) => setEm({ ...em, newEmail: v })} autoCapitalize="none" keyboardType="email-address" />
            <Field label="Your password" value={em.password} onChangeText={(v) => setEm({ ...em, password: v })} secureTextEntry />
            {mfa && <Field label="Two-step code" value={em.code} onChangeText={(v) => setEm({ ...em, code: v })} autoCapitalize="none" textContentType="oneTimeCode" />}
            <Button title="Send confirmation link" kind="secondary" busy={busy === 'em'} disabled={!em.newEmail || !em.password}
              onPress={() => run('em', async () => { await api.post('/me/email', { newEmail: em.newEmail.trim().toLowerCase(), password: em.password, ...(em.code ? { code: em.code.trim() } : {}) }); setEm({ newEmail: '', password: '', code: '' }); },
                'Open the link we sent to the new address (valid 24 hours). Your current email gets a notice too. Nothing changes until then.')} />
          </Card>)}

          {u && (<Card>
            <T h2>Delete my account</T>
            <T muted small>Your name, email and password are wiped and you are signed out everywhere. Bills you entered stay in the businesses' books as "Deleted user". This cannot be undone.</T>
            {me.data.blocksDeletion?.length > 0 && <Note kind="warn">First delete these businesses or make someone else an owner (on the website): {me.data.blocksDeletion.map((b) => b.name).join(', ')}.</Note>}
            <Field label="Your password" value={del.password} onChangeText={(v) => setDel({ ...del, password: v })} secureTextEntry />
            {mfa && <Field label="Two-step code" value={del.code} onChangeText={(v) => setDel({ ...del, code: v })} autoCapitalize="none" />}
            <Field label='Type "DELETE" to confirm' value={del.confirm} onChangeText={(v) => setDel({ ...del, confirm: v })} autoCapitalize="characters" />
            <Button title="Delete my account" kind="danger" busy={busy === 'del'} disabled={del.confirm !== 'DELETE' || !del.password || me.data.blocksDeletion?.length > 0}
              onPress={() => Alert.alert('Delete account?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive',
                onPress: () => run('del', async () => { await api.del('/me', { password: del.password, confirm: 'DELETE', ...(del.code ? { code: del.code.trim() } : {}) }); await clearToken(); router.replace('/login'); }) }])} />
          </Card>)}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
