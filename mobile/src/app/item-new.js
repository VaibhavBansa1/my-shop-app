// Add a stock item from the phone (accountants and above, like the website).
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { uploadPhoto } from '../lib/images.js';
import { absUrl } from '../lib/images.js';
import { api } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { Button, Card, Chips, ErrorNote, Field, Loading, Note, Picker, Screen } from '../components/ui.js';

const GST_RATES = [['0', '0%'], ['5', '5%'], ['12', '12%'], ['18', '18%'], ['28', '28%'], ['40', '40%']];

export default function NewItem() {
  const s = useSession();
  const units = useLoad(() => api.get(`/orgs/${s.org.id}/units`), [s.org.id]);
  const [f, setF] = useState({ name: '', sku: '', unitId: null, hsnCode: '', gstRate: '5', salePrice: '', purchasePrice: '', reorderLevel: '', openingQty: '', openingRate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null); // {id, urls}
  const set = (k) => (v) => setF({ ...f, [k]: v });

  if (!s.can('masters.write')) return <Screen><Note>Only accountants, admins and owners can add items.</Note></Screen>;
  if (!units.data) return <Screen>{units.loading ? <Loading /> : <ErrorNote error={units.error} />}</Screen>;
  const unitId = f.unitId ?? units.data.units.find((u) => u.symbol === 'pcs')?.id;

  async function save() {
    setBusy(true); setError(null);
    const num = (v) => (v === '' ? '0' : v);
    try {
      await api.post(`/orgs/${s.org.id}/items`, { ...f, name: f.name.trim(), unitId, salePrice: num(f.salePrice), purchasePrice: num(f.purchasePrice),
        reorderLevel: num(f.reorderLevel), openingQty: num(f.openingQty), openingRate: num(f.openingRate), ...(photo ? { imageId: photo.id } : {}) });
      router.back();
    } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <ErrorNote error={error} />
        <Card>
          <Field label="Item name" value={f.name} onChangeText={set('name')} maxLength={160} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field style={{ flex: 1 }} label="SKU / code" value={f.sku} onChangeText={set('sku')} maxLength={60} autoCapitalize="characters" />
            <Field style={{ flex: 1 }} label="HSN / SAC" value={f.hsnCode} onChangeText={set('hsnCode')} keyboardType="number-pad" maxLength={8} />
          </View>
          <Picker label="Unit" value={unitId} onChange={set('unitId')} options={units.data.units.map((u) => ({ value: u.id, label: `${u.symbol} · ${u.name}` }))} />
          <Chips options={GST_RATES} value={f.gstRate} onChange={set('gstRate')} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field style={{ flex: 1 }} label="Sale price ₹" hint="Before GST" value={f.salePrice} onChangeText={set('salePrice')} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Purchase price ₹" value={f.purchasePrice} onChangeText={set('purchasePrice')} keyboardType="decimal-pad" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field style={{ flex: 1 }} label="Opening qty" value={f.openingQty} onChangeText={set('openingQty')} keyboardType="decimal-pad" />
            <Field style={{ flex: 1 }} label="Opening rate ₹" value={f.openingRate} onChangeText={set('openingRate')} keyboardType="decimal-pad" />
          </View>
          <Field label="Reorder level" hint="Show as low stock at or below this quantity" value={f.reorderLevel} onChangeText={set('reorderLevel')} keyboardType="decimal-pad" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {photo && <Image source={absUrl(photo.urls.thumb)} style={{ width: 64, height: 64, borderRadius: 8 }} cachePolicy="memory-disk" />}
            <Button small kind="secondary" title={photo ? 'Change photo' : 'Add photo (optional)'} busy={busy} onPress={async () => {
              // The system photo picker needs no permission.
              const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [1, 1], exif: false });
              if (r.canceled || !r.assets?.[0]) return;
              setBusy(true); setError(null);
              try { setPhoto(await uploadPhoto(s.org.id, r.assets[0])); } catch (e) { setError(e); }
              setBusy(false);
            }} />
          </View>
          <Button title="Save item" onPress={save} busy={busy} disabled={!f.name.trim() || !unitId} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
