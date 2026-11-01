import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { STATE_LIST } from '../../../shared/states.js';
import { isValidGstin } from '../../../shared/gstin.js';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.js';
import { ROLE_LABEL } from '../lib/format.js';
import { Button, Card, ErrorNote, Field, Picker, Row, Screen, T } from '../components/ui.js';

export default function Orgs() {
  const s = useSession();
  const [creating, setCreating] = useState(s.orgs.length === 0);
  const [f, setF] = useState({ name: '', gstin: '', stateCode: '23', address: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const gstinBad = f.gstin.trim() && !isValidGstin(f.gstin.trim().toUpperCase());

  async function open(id) { await s.selectOrg(id); router.replace('/home'); }
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
        {s.orgs.length > 0 && (
          <Card>
            {s.orgs.map((o) => <Row key={o.id} title={o.name} subtitle={`${ROLE_LABEL[o.role]}${o.gstin ? ` · GSTIN ${o.gstin}` : ''}`} right="›" onPress={() => open(o.id)} />)}
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
