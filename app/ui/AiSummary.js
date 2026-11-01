'use client';
// "Summarise my shop" card (shown when the server has AI configured and the business turned it on).
import { useState } from 'react';
import { api } from './api.js';
import { ErrorNote } from './components.js';

export default function AiSummary({ orgId }) {
  const [period, setPeriod] = useState('month');
  const [language, setLanguage] = useState('en');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [error, setError] = useState(null);

  async function run(e) {
    e?.preventDefault(); setBusy(true); setError(null);
    try { setOut(await api(`/orgs/${orgId}/ai/summary`, { method: 'POST', body: { period, language, question } })); }
    catch (err) { setError(err); }
    setBusy(false);
  }

  return (
    <form className="card grid no-print" onSubmit={run} style={{ marginTop: 14 }}>
      <div className="row"><h2 style={{ margin: 0 }}>✨ Shop summary</h2><span className="spacer" />
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }} aria-label="Period">
          <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="fy">This financial year</option>
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 'auto' }} aria-label="Language">
          <option value="en">English</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option>
        </select>
      </div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Optional: ask a question, e.g. Which customers should I call for payment?" aria-label="Question" />
      <div className="row"><button className="btn btn-primary" disabled={busy}>{busy ? 'Thinking… (local models can take a minute)' : question ? 'Ask' : 'Summarise'}</button></div>
      <ErrorNote error={error} />
      {out && (
        <div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{out.summary}</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Written by {out.provider.replace(' (local)', '')} · {out.model}{out.local ? ', running on your own computer,' : ''} from your books for {out.period.label}.
            {!out.namesShared && ' Customer and item names were not shared.'} AI can make mistakes — check important numbers in Reports.
          </p>
        </div>
      )}
    </form>
  );
}
