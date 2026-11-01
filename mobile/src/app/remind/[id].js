// Payment reminder: WhatsApp / SMS open on this phone; email is sent by the server.
import { useEffect, useState } from 'react';
import { Linking, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { smsUrl, whatsappUrl } from '../../../../shared/messages.js';
import { api } from '../../lib/api.js';
import { useLoad, useSession } from '../../lib/session.js';
import { date, money } from '../../lib/format.js';
import { Button, Card, Chips, ErrorNote, Loading, Note, Screen, T, useTheme } from '../../components/ui.js';

export default function Remind() {
  const { id } = useLocalSearchParams();
  const s = useSession();
  const t = useTheme();
  const [language, setLanguage] = useState('en');
  const r = useLoad(() => api.get(`/orgs/${s.org.id}/reminders/${id}`, { language }), [s.org.id, id, language]);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { if (r.data) setMessage(r.data.message); }, [r.data]);

  async function send(channel) {
    setError(null);
    try {
      if (channel === 'whatsapp') await Linking.openURL(whatsappUrl(r.data.phone, message));
      if (channel === 'sms') await Linking.openURL(smsUrl(r.data.phone, message));
      await api.post(`/orgs/${s.org.id}/reminders/${id}`, { channel, language, message });
      setDone(channel === 'email' ? 'Email sent.' : 'Reminder recorded.');
    } catch (e) { setError(e); }
  }

  if (!r.data) return <Screen>{r.loading ? <Loading /> : <ErrorNote error={r.error} />}</Screen>;
  const d = r.data;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <Card>
          <T h2>{d.name}</T>
          <T>Owes <T bold>{money(d.balance)}</T></T>
          {d.lastReminder && <T muted small>Last reminded {date(d.lastReminder.at)} by {d.lastReminder.channel}</T>}
        </Card>
        <Chips options={[['en', 'English'], ['hi', 'हिन्दी'], ['hinglish', 'Hinglish']]} value={language} onChange={setLanguage} />
        <TextInput multiline value={message} onChangeText={setMessage} maxLength={1000}
          style={{ minHeight: 160, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12, color: t.ink, backgroundColor: t.surface, textAlignVertical: 'top', marginBottom: 12 }} />
        <ErrorNote error={error} />
        {done && <Note kind="ok">{done}</Note>}
        {d.balance <= 0 ? <Note kind="ok">Nothing is due from this customer.</Note> : (
          <>
            <Button title="Send on WhatsApp" onPress={() => send('whatsapp')} style={{ marginBottom: 8 }} />
            {d.phone && <Button kind="secondary" title="Send SMS" onPress={() => send('sms')} style={{ marginBottom: 8 }} />}
            {d.canEmail && <Button kind="secondary" title={`Email ${d.email}`} onPress={() => send('email')} />}
            {!d.phone && <T muted small style={{ marginTop: 8 }}>No phone saved for this customer: WhatsApp will ask you to choose a contact.</T>}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
