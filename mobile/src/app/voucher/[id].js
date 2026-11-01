import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { invoiceHtml } from '../../lib/invoiceHtml.js';
import { amount, date, money, qty, VOUCHER_TYPES } from '../../lib/format.js';
import { Button, Card, ErrorNote, Field, Loading, Note, Row, Screen, T, Totals } from '../../components/ui.js';

export default function VoucherView() {
  const { id } = useLocalSearchParams();
  const s = useSession();
  const v = useLoad(() => api.get(`/orgs/${s.org.id}/vouchers/${id}`), [s.org.id, id]);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: invoiceHtml(s.org, v.data) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: v.data.label, UTI: 'com.adobe.pdf' });
      else await Print.printAsync({ uri });
    } catch (e) { setError(e); }
    setBusy(false);
  }
  async function cancel() {
    setError(null);
    try { await api.post(`/orgs/${s.org.id}/vouchers/${id}/cancel`, { reason }); setCancelling(false); v.reload(); }
    catch (e) { setError(e); }
  }

  if (!v.data) return <Screen>{v.loading ? <Loading /> : <ErrorNote error={v.error} />}</Screen>;
  const d = v.data;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <ErrorNote error={error} />
        {d.status === 'cancelled' && <Note>Cancelled{d.cancelReason ? `: ${d.cancelReason}` : ''}. Not counted in reports.</Note>}
        <Card>
          <T h2>{d.label}</T>
          <T muted>{VOUCHER_TYPES[d.type]} · {date(d.date)}</T>
          {d.partyName ? <T style={{ marginTop: 6 }}>Party: <T bold>{d.partyName}</T></T> : null}
          {d.reference ? <T muted>Ref: {d.reference}</T> : null}
        </Card>
        <Card>
          {d.items.length > 0
            ? d.items.map((i, n) => <Row key={n} title={i.name} subtitle={`${qty(i.qty)} ${i.unit} × ${amount(i.rate)}${i.gstRate ? ` · GST ${i.gstRate}%` : ''}`} right={amount(i.taxableValue)} />)
            : d.entries.map((e, n) => <Row key={n} title={e.ledgerName} right={e.debit ? `Dr ${amount(e.debit)}` : `Cr ${amount(e.credit)}`} />)}
          <Totals lines={[
            ...(d.items.length ? [['Taxable value', money(d.taxableTotal)], ...(d.taxTotal ? [['GST', money(d.taxTotal)]] : []), ...(d.roundOff ? [['Round off', money(d.roundOff)]] : [])] : []),
            ['Total', money(d.total), true],
          ]} />
          {d.narration ? <T muted style={{ marginTop: 8 }}>{d.narration}</T> : null}
        </Card>
        <Button title="Share / print PDF" onPress={share} busy={busy} style={{ marginBottom: 10 }} />
        {d.status === 'posted' && s.can('voucher.cancel') && !cancelling && <Button kind="danger" title="Cancel this voucher" onPress={() => setCancelling(true)} />}
        {cancelling && (
          <Card>
            <Field label="Reason for cancelling" value={reason} onChangeText={setReason} maxLength={300}
              hint="Cancelled vouchers stay on record with this reason, so numbering and the audit trail stay complete." />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button kind="danger" title="Confirm cancel" disabled={!reason.trim()} onPress={() => Alert.alert('Cancel voucher?', 'This cannot be undone.', [{ text: 'Keep' }, { text: 'Cancel it', style: 'destructive', onPress: cancel }])} style={{ flex: 1 }} />
              <Button kind="secondary" title="Keep" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
            </View>
          </Card>
        )}
        <T muted small style={{ marginTop: 10 }}>Entered by {d.createdBy}</T>
      </ScrollView>
    </Screen>
  );
}
