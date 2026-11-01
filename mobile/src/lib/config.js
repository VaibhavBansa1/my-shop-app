// Server address. Default comes from app.json "extra.apiUrl"; users can change it in
// More → Server (useful for self-hosting or testing against a PC on the same Wi-Fi).
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { validateServerUrl } from './url.js';

export { validateServerUrl };

const KEY = 'myshop.serverUrl';
export const DEFAULT_URL = Constants.expoConfig?.extra?.apiUrl ?? '';

export async function getServerUrl() {
  return (await SecureStore.getItemAsync(KEY)) || DEFAULT_URL;
}
export async function setServerUrl(url) {
  const v = validateServerUrl(url);
  if (!v.ok) throw new Error(v.error);
  await SecureStore.setItemAsync(KEY, v.url);
  return v.url;
}
