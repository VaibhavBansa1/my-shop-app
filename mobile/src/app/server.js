import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { getServerUrl, setServerUrl, DEFAULT_URL } from '../lib/config.js';
import { Button, Card, ErrorNote, Field, Screen, T } from '../components/ui.js';

export default function Server() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { getServerUrl().then(setUrl); }, []);
  async function save() {
    setError(null);
    try {
      const saved = await setServerUrl(url);
      const res = await fetch(`${saved}/api/health`).catch(() => null);
      if (!res?.ok) throw new Error('Saved, but the server did not answer. Check the address.');
      router.back();
    } catch (e) { setError(e); }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Card>
          <T style={{ marginBottom: 10 }}>The address of your My Shop server. Use https. For testing with a computer on your own Wi-Fi, http://192.168.x.x:3000 also works.</T>
          <ErrorNote error={error} />
          <Field label="Server address" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={DEFAULT_URL} />
          <Button title="Save and test" onPress={save} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
