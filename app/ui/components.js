'use client';
import { useEffect, useState, useCallback } from 'react';

export function useApi(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try { setState({ data: await fn(), error: null, loading: false }); }
    catch (error) { setState({ data: null, error, loading: false }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note note-error" role="alert">{error.message || String(error)}</div>;
}

export function Loading() {
  return <div className="loading" aria-live="polite">Loading…</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
