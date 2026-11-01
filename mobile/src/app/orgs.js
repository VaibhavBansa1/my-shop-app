import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { STATE_LIST } from '../../../shared/states.js';
import { isValidGstin } from '../../../shared/gstin.js';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { ROLE_LABEL, money } from '../lib/format.js';
import { Button, Card, ErrorNote, Field, Note, Picker, Row, Screen, T } from '../components/ui.js';

export default function Orgs() {
  const s = useSession();
  const [creating, setCreating] = useState(s.orgs.length === 0);
  const [f, setF] = useState({ name: '', gstin: '', stateCode: '23', address: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);
  const set = (k) => (v) => setF(k === 'gstin' && /^[0-9]{2}/.test(v.trim()) ? { ...f, gstin: v, stateCode: v.trim().slice(0, 2) } : { ...f, [k]: v });
  const gstinBad = f.gstin.trim() && !isValidGstin(f.gstin.trim().toUpperCase());

  async function open(id) { await s.selectOrg(id); router.replace('/home'); }
  // Several businesses: show today's sales for each.
  const [overview, setOverview] = useState({});
  useEffect(() => {
    if (s.orgs.length < 2) return;
    Promise.all(s.orgs.map((o) => api.get(`/orgs/${o.id}/reports/dashboard`).then((d) => [o.id, d]).catch(() => [o.id, null])))
      .then((p) => setOverview(Object.fromEntries(p)));
  }, [s.orgs]);
  async function create() {
    setBusy(true); setError(null);
    try {
      const org = await api.post('/orgs', { ...f, name: f.name.trim(), gstin: f.gstin.trim().toUpperCase() });
      await s.refresh();
      await open(org.id);
    } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {s.user && !s.user.emailVerified && s.verification !== 'off' && (
          <Card>
            <T bold>Please confirm your email address.</T>
            <T muted small style={{ marginVertical: 6 }}>Open the link we emailed you, then come back and pull to refresh.{s.verification === 'required' ? ' You need this before creating or joining a business.' : ''}</T>
            {resent ? <Note kind="ok">Sent again. Check your inbox and spam folder.</Note>
              : <Button small kind="secondary" title="Send the link again" onPress={async () => { try { await api.post('/auth/verify-email/request'); setResent(true); } catch (e) { setError(e); } }} />}
            <Button small kind="secondary" title="I have confirmed it" onPress={() => s.refresh()} style={{ marginTop: 8 }} />
          </Card>
        )}
        {s.orgs.length > 0 && (
          <Card>
            {s.orgs.map((o) => <Row key={o.id} title={o.name}
              subtitle={`${ROLE_LABEL[o.role]}${o.gstin ? ` · GSTIN ${o.gstin}` : ''}${overview[o.id] ? `\nToday ${money(overview[o.id].today.sales)} · Month ${money(overview[o.id].month.sales?.total ?? 0)}` : ''}`}
              right="›" onPress={() => open(o.id)} />)}
          </Card>
        )}
        {s.orgs.length === 0 && <T muted style={{ marginBottom: 12 }}>You don’t have a business yet. Create one, or ask your employer to invite your email and sign in again.</T>}
        {!creating ? <Button kind="secondary" title="+ Create a new business" onPress={() => setCreating(true)} /> : (
          <Card>
            <T h2 style={{ marginBottom: 10 }}>New business</T>
            <ErrorNote error={error} />
            <Field label="Business name" value={f.name} onChangeText={set('name')} maxLength={120} />
            <Field label="GSTIN (optional)" value={f.gstin} onChangeText={set('gstin')} autoCapitalize="characters" maxLength={15}
              error={gstinBad ? 'This GSTIN does not look right (check digit).' : null}
              hint="Leave empty if not GST registered. GST is only charged when a GSTIN is set." />
            <Picker label="State" value={f.stateCode} onChange={set('stateCode')} options={STATE_LIST.map(([c, n]) => ({ value: c, label: `${c} · ${n}` }))} />
            <Field label="Address" value={f.address} onChangeText={set('address')} multiline maxLength={500} />
            <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={40} />
            <Button title="Create" onPress={create} busy={busy} disabled={!f.name.trim() || gstinBad} />
          </Card>
        )}
        <Button kind="secondary" title="Sign out" onPress={async () => { await s.logout(); router.replace('/login'); }} style={{ marginTop: 12 }} />
      </ScrollView>
    </Screen>
  );
}
