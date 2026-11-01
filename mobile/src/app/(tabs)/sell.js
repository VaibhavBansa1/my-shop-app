// New sale (also used for purchase via ?type=purchase from the scan screen's "edit" path).
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { computeInvoice } from '../../../../shared/gst.js';
import { toMilli, toPaise } from '../../../../shared/money.js';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { money, today } from '../../lib/format.js';
import { Button, Card, ErrorNote, Field, Loading, Note, Picker, Screen, T, Totals, useTheme } from '../../components/ui.js';

const blankLine = () => ({ stockItemId: null, qty: '1', rate: '', discount: '' });

/** Exact preview with the same integer GST maths the server uses (shared/gst.js). */
function preview(lines, itemMap, gstOn, interState) {
  try {
    const valid = lines.filter((l) => l.stockItemId && Number(l.qty) > 0 && l.rate !== '');
    if (!valid.length) return null;
    return computeInvoice(valid.map((l) => ({
      qtyMilli: toMilli(l.qty), ratePaise: toPaise(l.rate), discountPaise: toPaise(l.discount || 0),
      gstRateBp: gstOn ? toPaise(itemMap.get(l.stockItemId)?.gstRate ?? 0) : 0,
    })), { interState });
  } catch { return null; }
}

export default function Sell() {
  const s = useSession();
  const t = useTheme();
  const org = s.org;
  const masters = useLoad(async () => {
    const [l, i] = await Promise.all([api.get(`/orgs/${org.id}/ledgers`, { group: 'sundry_debtors' }), api.get(`/orgs/${org.id}/items`)]);
    return { customers: l.ledgers.filter((x) => x.isActive), items: i.items.filter((x) => x.isActive) };
  }, [org.id]);
  const [party, setParty] = useState(null);
  const [lines, setLines] = useState([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Correction mode (?from=<voucherId>): prefill; saving cancels the original in the same transaction.
  const { from } = useLocalSearchParams();
  const [original, setOriginal] = useState(null);
  useEffect(() => {
    if (!from) { setOriginal(null); return; }
    api.get(`/orgs/${org.id}/vouchers/${from}`).then((v) => {
      if (v.type !== 'sales' || v.status !== 'posted') return;
      setOriginal(v);
      setParty(v.partyName === 'Cash' ? null : v.partyLedgerId);
      setLines(v.items.map((i) => ({ stockItemId: i.stockItemId, qty: String(i.qty), rate: String(i.rate), discount: i.discount ? String(i.discount) : '' })));
    }).catch(setError);
  }, [from, org.id]);

  const itemMap = useMemo(() => new Map((masters.data?.items ?? []).map((i) => [i.id, i])), [masters.data]);
  const customer = masters.data?.customers.find((c) => c.id === party);
  const gstOn = Boolean(org.gstin);
  const pos = customer?.stateCode || org.stateCode;
  const interState = gstOn && Boolean(org.stateCode && pos && org.stateCode !== pos);
  const inv = preview(lines, itemMap, gstOn, interState);

  const setLine = (i, k, v) => setLines(lines.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [k]: v };
    if (k === 'stockItemId') n.rate = String(itemMap.get(v)?.salePrice ?? '');
    return n;
  }));

  async function save() {
    setBusy(true); setError(null);
    try {
      const v = await api.post(`/orgs/${org.id}/vouchers`, {
        type: 'sales', date: original?.date ?? today(), partyLedgerId: party, ...(original ? { replacesVoucherId: original.id } : {}),
        items: lines.filter((l) => l.stockItemId).map((l) => ({ stockItemId: l.stockItemId, qty: l.qty, rate: l.rate || '0', discount: l.discount || '0' })),
      });
      setLines([blankLine()]); setParty(null); setOriginal(null); setBusy(false);
      router.setParams({ from: undefined });
      router.push(`/voucher/${v.id}`);
    } catch (e) { setError(e); setBusy(false); }
  }

  if (!masters.data) return <Screen>{masters.loading ? <Loading /> : <ErrorNote error={masters.error} />}</Screen>;
  const itemOptions = masters.data.items.map((i) => ({ value: i.id, label: i.name, sub: `${i.stockQty ?? 0} ${i.unitSymbol} in stock · ${money(i.salePrice)}` }));
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <ErrorNote error={error} />
        {original && <Note kind="warn">Correcting {original.label}. Saving creates a new bill and cancels the original (kept on record as replaced).</Note>}
        {masters.data.items.length === 0 && <T muted style={{ marginBottom: 10 }}>No stock items yet. Add items on the website (Stock) first.</T>}
        <Card>
          <Picker label="Customer" value={party} onChange={setParty} placeholder="Cash sale" allowClear
            options={masters.data.customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone || c.gstin || '' }))} />
          {gstOn && <T muted small>{interState ? 'Other state: IGST' : 'Same state: CGST + SGST'}</T>}
        </Card>
        {lines.map((l, i) => {
          const it = itemMap.get(l.stockItemId);
          return (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T bold>Item {i + 1}</T>
                {lines.length > 1 && <Pressable accessibilityLabel="Remove item" onPress={() => setLines(lines.filter((_, j) => j !== i))}><T style={{ color: t.danger, padding: 6 }}>Remove</T></Pressable>}
              </View>
              <Picker value={l.stockItemId} onChange={(v) => setLine(i, 'stockItemId', v)} options={itemOptions} placeholder="Choose item…" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field style={{ flex: 1 }} label={`Qty${it ? ` (${it.unitSymbol})` : ''}`} value={l.qty} onChangeText={(v) => setLine(i, 'qty', v)} keyboardType="decimal-pad" />
                <Field style={{ flex: 1 }} label="Rate ₹" value={l.rate} onChangeText={(v) => setLine(i, 'rate', v)} keyboardType="decimal-pad" />
                <Field style={{ flex: 1 }} label="Disc. ₹" value={l.discount} onChangeText={(v) => setLine(i, 'discount', v)} keyboardType="decimal-pad" placeholder="0" />
              </View>
              {it && gstOn && <T muted small>GST {it.gstRate}%</T>}
            </Card>
          );
        })}
        <Button kind="secondary" title="+ Add item" onPress={() => setLines([...lines, blankLine()])} style={{ marginBottom: 12 }} />
        {inv && (
          <Card>
            <Totals lines={[
              ['Taxable value', money(inv.taxable / 100)],
              ...(gstOn ? (interState ? [['IGST', money(inv.igst / 100)]] : [['CGST', money(inv.cgst / 100)], ['SGST', money(inv.sgst / 100)]]) : []),
              ['Round off', money(inv.roundOff / 100)],
              ['Total', money(inv.total / 100), true],
            ]} />
          </Card>
        )}
        <Button title="Save bill" onPress={save} busy={busy} disabled={!inv} />
      </ScrollView>
    </Screen>
  );
}
