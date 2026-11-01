// Scan a supplier invoice: camera/gallery → OCR (on-device first, server fallback) →
// review every field → create missing supplier/items → save as a purchase voucher.
import { useState } from 'react';
import { Alert, Image, Linking, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { isValidGstin } from '../../../shared/gstin.js';
import { api } from '../lib/api.js';
import { deviceOcrAvailable, scanInvoice } from '../lib/ocr.js';
import { useLoad, useSession } from '../lib/session.js';
import { money, today } from '../lib/format.js';
import { Button, Card, Chips, ErrorNote, Field, Loading, Note, Picker, Screen, T } from '../components/ui.js';

export default function Scan() {
  const s = useSession();
  const org = s.org;
  const masters = useLoad(async () => {
    const [i, u, g] = await Promise.all([api.get(`/orgs/${org.id}/items`), api.get(`/orgs/${org.id}/units`), api.get(`/orgs/${org.id}/groups`)]);
    return { items: i.items.filter((x) => x.isActive), units: u.units, groups: g.groups };
  }, [org.id]);
  const [photo, setPhoto] = useState(null);
  const [engine, setEngine] = useState(deviceOcrAvailable() ? 'device' : 'server');
  const [draft, setDraft] = useState(null);
  const [lines, setLines] = useState([]);       // editable copy of draft items
  const [head, setHead] = useState({ date: today(), reference: '', supplierName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pick(fromCamera) {
    setError(null);
    // Camera needs permission. Choosing a photo uses the system photo picker, which needs none
    // (storage permissions are deliberately removed from the app for privacy).
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          Alert.alert('Camera permission is off', 'Allow camera access for My Shop in your phone settings to scan invoices.',
            [{ text: 'Not now' }, { text: 'Open settings', onPress: () => Linking.openSettings() }]);
        } else setError(new Error('Camera permission is needed to scan. You can also choose a photo instead.'));
        return;
      }
    }
    const opts = { mediaTypes: ['images'], quality: 1, allowsEditing: true, exif: false };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setPhoto(asset); setBusy(true); setDraft(null);
    try {
      const d = await scanInvoice(org.id, asset, { preferDevice: engine === 'device' });
      setDraft(d);
      setHead({ date: d.invoiceDate || today(), reference: d.invoiceNumber ?? '', supplierName: d.supplierName ?? '' });
      setLines(d.items.map((l) => ({ ...l, choice: l.match?.stockItemId ?? 'new', qty: String(l.qty), rate: String(l.rate) })));
    } catch (e) { setError(e); }
    setBusy(false);
  }

  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function createSupplier() {
    setBusy(true); setError(null);
    try {
      const groupId = masters.data.groups.find((g) => g.code === 'sundry_creditors').id;
      const l = await api.post(`/orgs/${org.id}/ledgers`, { name: head.supplierName.trim(), groupId, gstin: draft.supplierGstin, stateCode: draft.supplierGstin.slice(0, 2) });
      setDraft({ ...draft, supplier: { ledgerId: l.id, name: l.name } });
    } catch (e) { setError(e); }
    setBusy(false);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const pcs = masters.data.units.find((u) => u.symbol === 'pcs')?.id ?? masters.data.units[0]?.id;
      const items = [];
      for (const [idx, l] of lines.entries()) {
        if (l.choice === 'skip') continue;
        let id = l.choice;
        if (id === 'new') {
          const created = await api.post(`/orgs/${org.id}/items`, { name: l.description, unitId: pcs,
            hsnCode: l.hsn && /^\d{4,8}$/.test(l.hsn) ? l.hsn : '', gstRate: String(l.gstRate ?? 0), purchasePrice: l.rate });
          id = created.id;
          // Remember the new item so a retry after a later failure does not create it twice.
          setLines((cur) => cur.map((x, j) => (j === idx ? { ...x, choice: id } : x)));
        }
        items.push({ stockItemId: id, qty: l.qty, rate: l.rate, discount: String(l.discount || 0), ...(l.gstRate != null ? { gstRate: String(l.gstRate) } : {}) });
      }
      const v = await api.post(`/orgs/${org.id}/vouchers`, {
        type: 'purchase', date: head.date, partyLedgerId: draft.supplier?.ledgerId ?? null, reference: head.reference.slice(0, 80),
        narration: `Scanned invoice${head.reference ? ` ${head.reference}` : ''}`, items,
      });
      router.replace(`/voucher/${v.id}`);
      if (draft.totals.total != null && Math.abs(v.total - draft.totals.total) > 1) {
        Alert.alert('Please check the total', `Saved total ${money(v.total)} differs from the invoice total ${money(draft.totals.total)}. If it is wrong, cancel this voucher and enter it again.`);
      }
    } catch (e) { setError(e); setBusy(false); }
  }

  if (!s.can('voucher.create.purchase')) return <Screen><Note>Your role cannot record purchases.</Note></Screen>;
  if (!masters.data) return <Screen>{masters.loading ? <Loading /> : <ErrorNote error={masters.error} />}</Screen>;
  const itemOptions = [{ value: 'new', label: '+ Create as a new item' }, { value: 'skip', label: 'Skip this line' },
    ...masters.data.items.map((i) => ({ value: i.id, label: i.name, sub: i.hsnCode ? `HSN ${i.hsnCode}` : '' }))];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        {!draft && (
          <Card>
            <T style={{ marginBottom: 10 }}>Photograph a supplier’s GST invoice. We read it and fill a purchase for you to check before saving. Photos are not stored.</T>
            <Chips options={[['device', 'Read on phone'], ['server', 'Read on server']]} value={engine} onChange={setEngine} />
            {engine === 'device' && !deviceOcrAvailable() && <Note kind="warn">On-phone reading is not available in this build; the server will read it instead.</Note>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="📷 Take photo" onPress={() => pick(true)} busy={busy} style={{ flex: 1 }} />
              <Button kind="secondary" title="Choose photo" onPress={() => pick(false)} disabled={busy} style={{ flex: 1 }} />
            </View>
          </Card>
        )}
        <ErrorNote error={error} />
        {photo && busy && !draft && <Card><Image source={{ uri: photo.uri }} style={{ width: '100%', height: 220, resizeMode: 'contain' }} /><Loading /><T muted style={{ textAlign: 'center' }}>Reading the invoice…</T></Card>}
        {draft && (
          <>
            {draft.warnings.map((w, i) => <Note key={i} kind="warn">{w}</Note>)}
            <Card>
              <T h2 style={{ marginBottom: 8 }}>Supplier</T>
              {draft.supplier ? <T bold>{draft.supplier.name}</T> : draft.supplierGstin ? (
                <>
                  <T muted small>GSTIN {draft.supplierGstin} is not in your suppliers yet.</T>
                  <Field label="Supplier name" value={head.supplierName} onChangeText={(v) => setHead({ ...head, supplierName: v })} maxLength={120} />
                  <Button kind="secondary" small title="+ Create supplier" onPress={createSupplier} disabled={!head.supplierName.trim() || !isValidGstin(draft.supplierGstin)} busy={busy} />
                </>
              ) : <T muted>Not found — the purchase will be recorded as a cash purchase.</T>}
            </Card>
            <Card>
              <Field label="Invoice number" value={head.reference} onChangeText={(v) => setHead({ ...head, reference: v })} maxLength={80} />
              <Field label="Invoice date (YYYY-MM-DD)" value={head.date} onChangeText={(v) => setHead({ ...head, date: v })} maxLength={10} autoCapitalize="none" />
              {draft.totals.total != null && <T>Invoice total: <T bold>{money(draft.totals.total)}</T></T>}
            </Card>
            {lines.map((l, i) => (
              <Card key={i}>
                <T bold>{l.description}</T>
                {l.hsn || l.gstRate != null ? <T muted small>{l.hsn ? `HSN ${l.hsn}` : ''}{l.gstRate != null ? ` · GST ${l.gstRate}%` : ''}</T> : null}
                <Picker label="Stock item" value={l.choice} onChange={(v) => setLine(i, 'choice', v)} options={itemOptions} />
                {l.choice !== 'skip' && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Field style={{ flex: 1 }} label="Qty" value={l.qty} onChangeText={(v) => setLine(i, 'qty', v)} keyboardType="decimal-pad" />
                    <Field style={{ flex: 1 }} label="Rate ₹" value={l.rate} onChangeText={(v) => setLine(i, 'rate', v)} keyboardType="decimal-pad" />
                  </View>
                )}
              </Card>
            ))}
            {lines.length === 0 && <Note kind="warn">No item lines were read. Record this purchase on the website instead.</Note>}
            <Button title="Save purchase" onPress={save} busy={busy} disabled={!lines.some((l) => l.choice !== 'skip')} style={{ marginBottom: 8 }} />
            <Button kind="secondary" title="Scan again" onPress={() => { setDraft(null); setPhoto(null); }} />
            <T muted small style={{ marginTop: 8 }}>Read {draft.ocr?.engine === 'device' ? 'on this phone' : 'on the server'}{draft.ocr?.confidence != null ? ` · ${draft.ocr.confidence}% confidence` : ''}</T>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
