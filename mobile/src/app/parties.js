import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { STATE_LIST } from '../../../shared/states.js';
import { isValidGstin } from '../../../shared/gstin.js';
import { api } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { Button, Card, Chips, ErrorNote, Field, Loading, Picker, Row, Screen, T } from '../components/ui.js';

export default function Parties() {
  const s = useSession();
  const [kind, setKind] = useState('sundry_debtors');
  const list = useLoad(() => api.get(`/orgs/${s.org.id}/ledgers`, { group: kind }), [s.org.id, kind]);
  const groups = useLoad(() => api.get(`/orgs/${s.org.id}/groups`), [s.org.id]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', gstin: '', stateCode: s.org.stateCode ?? '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const gstinBad = f.gstin.trim() && !isValidGstin(f.gstin.trim().toUpperCase());

  async function add() {
    setBusy(true); setError(null);
    try {
      const groupId = groups.data.groups.find((g) => g.code === kind).id;
      const g = f.gstin.trim().toUpperCase();
      await api.post(`/orgs/${s.org.id}/ledgers`, { name: f.name.trim(), groupId, phone: f.phone, gstin: g, stateCode: g ? g.slice(0, 2) : f.stateCode });
      setAdding(false); setF({ name: '', phone: '', gstin: '', stateCode: s.org.stateCode ?? '' }); list.reload();
    } catch (e) { setError(e); }
    setBusy(false);
  }

  return (
    <Screen>
      <FlatList contentContainerStyle={{ padding: 14 }} data={list.data?.ledgers ?? []} keyExtractor={(l) => l.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View>
          <Chips options={[['sundry_debtors', 'Customers'], ['sundry_creditors', 'Suppliers']]} value={kind} onChange={setKind} />
          {s.can('party.create') && !adding && <Button kind="secondary" title={`+ Add ${kind === 'sundry_debtors' ? 'customer' : 'supplier'}`} onPress={() => setAdding(true)} style={{ marginBottom: 12 }} />}
          {adding && (
            <Card>
              <ErrorNote error={error} />
              <Field label="Name" value={f.name} onChangeText={set('name')} maxLength={120} />
              <Field label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={40} />
              <Field label="GSTIN (optional)" value={f.gstin} onChangeText={set('gstin')} autoCapitalize="characters" maxLength={15} error={gstinBad ? 'Check this GSTIN (check digit does not match).' : null} />
              {!f.gstin.trim() && <Picker label="State" value={f.stateCode} onChange={set('stateCode')} options={STATE_LIST.map(([c, n]) => ({ value: c, label: `${c} · ${n}` }))} />}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Save" onPress={add} busy={busy} disabled={!f.name.trim() || gstinBad || !groups.data} style={{ flex: 1 }} />
                <Button kind="secondary" title="Cancel" onPress={() => setAdding(false)} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
          <ErrorNote error={list.error} />
        </View>}
        ListEmptyComponent={list.loading ? <Loading /> : <T muted style={{ textAlign: 'center', padding: 20 }}>None yet.</T>}
        renderItem={({ item: l }) => <Row title={l.name} subtitle={[l.phone, l.gstin].filter(Boolean).join(' · ')} right="›" onPress={() => router.push(`/ledger/${l.id}`)} />}
      />
    </Screen>
  );
}
