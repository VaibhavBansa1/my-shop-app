// REST client for /api/v1 — the same API the website uses. Auth is a bearer token
// kept in SecureStore (Android Keystore / iOS Keychain), never in plain storage.
import * as SecureStore from 'expo-secure-store';
import { getServerUrl } from './config.js';

const TOKEN_KEY = 'myshop.token';
const TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor(status, body, fallback) {
    super(body?.error?.message || fallback || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (t) => SecureStore.setItemAsync(TOKEN_KEY, t, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

async function request(path, { method = 'GET', body, query, raw, contentType, timeout = TIMEOUT_MS } = {}) {
  const base = await getServerUrl();
  if (!base) throw new ApiError(0, null, 'Set the server address first (More → Server).');
  let url = `${base}/api/v1${path}`;
  if (query) {
    const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    if (qs) url += `?${qs}`;
  }
  const token = await getToken();
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (raw) headers['content-type'] = contentType;
  else if (body !== undefined) headers['content-type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    // credentials: 'omit' — the app authenticates only with the bearer token, never cookies.
    res = await fetch(url, { method, headers, credentials: 'omit', body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(0, null, e.name === 'AbortError' ? 'The server took too long to answer.' : 'Could not reach the server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    await clearToken();
    onUnauthorized();
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path, query) => request(path, { query }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path, body) => request(path, { method: 'DELETE', body }),
  upload: (path, blob, contentType = 'image/jpeg') => request(path, { method: 'POST', raw: blob, contentType, timeout: 90_000 }),
};

export async function login(email, password) {
  const r = await request('/auth/login', { method: 'POST', body: { email, password, returnToken: true } });
  await saveToken(r.token);
  return r.user;
}

export async function signup(name, email, password) {
  const r = await request('/auth/signup', { method: 'POST', body: { name, email, password, returnToken: true } });
  await saveToken(r.token);
  return r.user;
}

export async function logout() {
  try { await request('/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
  await clearToken();
}
