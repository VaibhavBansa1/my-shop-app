// App-wide session: signed-in user, their businesses, the selected business and its permissions.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, getToken, logout as apiLogout, setUnauthorizedHandler } from './api.js';

const ORG_KEY = 'myshop.orgId';
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null, orgs: [], org: null, verification: 'off' });

  const loadOrg = useCallback(async (orgId) => {
    if (!orgId) return null;
    try { return await api.get(`/orgs/${orgId}`); } catch { return null; }
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setState({ ready: true, user: null, orgs: [], org: null }); return; }
    try {
      const me = await api.get('/me');
      const saved = await SecureStore.getItemAsync(ORG_KEY);
      const pick = me.orgs.find((o) => o.id === saved) ?? (me.orgs.length === 1 ? me.orgs[0] : null);
      const org = pick ? await loadOrg(pick.id) : null;
      setState({ ready: true, user: me.user, orgs: me.orgs, org, verification: me.verification ?? 'off' });
    } catch {
      setState({ ready: true, user: null, orgs: [], org: null });
    }
  }, [loadOrg]);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ ready: true, user: null, orgs: [], org: null }));
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    can: (action) => Boolean(state.org?.permissions?.includes(action)),
    async selectOrg(orgId) {
      await SecureStore.setItemAsync(ORG_KEY, orgId);
      const org = await loadOrg(orgId);
      setState((s) => ({ ...s, org }));
      return org;
    },
    async clearOrg() {
      await SecureStore.deleteItemAsync(ORG_KEY);
      setState((s) => ({ ...s, org: null }));
    },
    async logout() {
      await apiLogout();
      await SecureStore.deleteItemAsync(ORG_KEY);
      setState({ ready: true, user: null, orgs: [], org: null });
    },
  }), [state, refresh, loadOrg]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Fetch helper with loading/error state and manual reload. */
export function useLoad(fn, deps) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setS((p) => ({ ...p, loading: true }));
    try { setS({ data: await fn(), error: null, loading: false }); }
    catch (error) { setS((p) => ({ data: p.data, error, loading: false })); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}
