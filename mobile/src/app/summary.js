// AI "Summarise my shop" on the phone (same server endpoint as the website).
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { api } from '../lib/api.js';
import { useLoad, useSession } from '../lib/session.js';
import { Button, Card, Chips, ErrorNote, Field, Loading, Note, Screen, T } from '../components/ui.js';

export default function Summary() {
  const s = useSession();
  const status = useLoad(() => api.get('/ai/status'), []);
  const [period, setPeriod] = useState('month');
  const [language, setLanguage] = useState('en');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true); setError(null);
    try { setOut(await api.post(`/orgs/${s.org.id}/ai/summary`, { period, language, question: question.trim() })); }
    catch (e) { setError(e); }
    setBusy(false);
  }

  if (!status.data) return <Screen>{status.loading ? <Loading /> : <ErrorNote error={status.error} />}</Screen>;
  if (!status.data.available) return <Screen><ScrollView contentContainerStyle={{ padding: 14 }}><Note kind="warn">AI is not set up on this server. The person who runs the server can connect Ollama, LM Studio, Groq or OpenRouter.</Note></ScrollView></Screen>;
  if (!s.org.aiEnabled) return <Screen><ScrollView contentContainerStyle={{ padding: 14 }}><Note kind="warn">AI summaries are turned off for this business. An owner or admin can turn them on in Settings on the website.</Note></ScrollView></Screen>;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <Chips options={[['today', 'Today'], ['week', '7 days'], ['month', 'Month'], ['fy', 'Year']]} value={period} onChange={setPeriod} />
        <Chips options={[['en', 'English'], ['hi', 'हिन्दी'], ['hinglish', 'Hinglish']]} value={language} onChange={setLanguage} />
        <Field label="Ask a question (optional)" value={question} onChangeText={setQuestion} maxLength={500} placeholder="Which customers should I call for payment?" />
        <Button title={busy ? 'Thinking…' : question.trim() ? 'Ask' : 'Summarise my shop'} onPress={run} busy={busy} />
        <ErrorNote error={error} />
        {out && (
          <Card style={{ marginTop: 12 }}>
            <T style={{ lineHeight: 22 }}>{out.summary}</T>
            <T muted small style={{ marginTop: 10 }}>By {out.provider.replace(' (local)', '')} · {out.model}{out.local ? ' (your own computer)' : ''}. AI can make mistakes — check numbers in Reports.</T>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
