// Optional AI integration through any OpenAI-compatible Chat Completions API.
// Configure with environment variables (see .env.example):
//   AI_PROVIDER   ollama | lmstudio | openrouter | xai | openai | custom   (unset = AI off)
//   AI_BASE_URL   override the provider's default URL (required for custom)
//   AI_API_KEY    API key for cloud providers (not needed for Ollama / LM Studio)
//   AI_MODEL      model name, e.g. llama3.2, qwen2.5:7b, openai/gpt-4o-mini, grok-…
//   AI_TIMEOUT_MS request timeout (default 120000; local models can be slow)
//   AI_MAX_TOKENS answer length limit (default 900)
//   AI_SHARE_NAMES  'local-only' (default) | 'always' | 'never' — whether customer/supplier/item names
//                   are sent; with 'local-only' they are replaced by placeholders for cloud providers.
// The base URL comes only from server configuration (never from users), so this cannot be used
// to make the server call arbitrary addresses.

export const PRESETS = {
  ollama:     { label: 'Ollama (local)',     baseUrl: 'http://localhost:11434/v1', needsKey: false, defaultModel: 'llama3.2' },
  lmstudio:   { label: 'LM Studio (local)',  baseUrl: 'http://localhost:1234/v1',  needsKey: false, defaultModel: 'local-model' },
  openrouter: { label: 'OpenRouter',         baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: 'openrouter/auto' },
  xai:        { label: 'xAI Grok',           baseUrl: 'https://api.x.ai/v1',       needsKey: true, defaultModel: null },
  openai:     { label: 'OpenAI',             baseUrl: 'https://api.openai.com/v1', needsKey: true, defaultModel: null },
  custom:     { label: 'OpenAI-compatible',  baseUrl: null,                         needsKey: false, defaultModel: null },
};

export function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === 'host.docker.internal' || h.endsWith('.local');
  } catch { return false; }
}

export function aiConfig() {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase();
  const preset = PRESETS[provider];
  if (!preset) return null;
  const baseUrl = (process.env.AI_BASE_URL || preset.baseUrl || '').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || preset.defaultModel;
  const apiKey = process.env.AI_API_KEY || '';
  const problems = [];
  if (!baseUrl) problems.push('AI_BASE_URL is required for this provider');
  if (!model) problems.push('AI_MODEL is required for this provider');
  if (preset.needsKey && !apiKey) problems.push('AI_API_KEY is required for this provider');
  let local = false;
  if (baseUrl) {
    try {
      const u = new URL(baseUrl);
      if (!['http:', 'https:'].includes(u.protocol)) problems.push('AI_BASE_URL must be http(s)');
      local = isLocalUrl(baseUrl);
      if (u.protocol === 'http:' && !local) problems.push('AI_BASE_URL must use https for non-local servers');
    } catch { problems.push('AI_BASE_URL is not a valid URL'); }
  }
  const share = (process.env.AI_SHARE_NAMES || 'local-only').toLowerCase();
  return {
    provider, label: preset.label, baseUrl, model, apiKey, local, problems,
    timeoutMs: Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS) || 120_000, 5_000), 600_000),
    maxTokens: Math.min(Math.max(Number(process.env.AI_MAX_TOKENS) || 900, 100), 4000),
    shareNames: share === 'always' || (share !== 'never' && local),
  };
}

/** Safe-to-show status (no secrets). */
export function aiStatus() {
  const c = aiConfig();
  if (!c) return { available: false, reason: 'not_configured' };
  if (c.problems.length) return { available: false, reason: 'misconfigured', provider: c.label };
  return { available: true, provider: c.label, model: c.model, local: c.local, sharesNames: c.shareNames };
}

export class AiError extends Error {}

/** Remove hidden reasoning that some local models (DeepSeek-R1, Qwen3…) print. */
export function cleanAnswer(text) {
  return String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*<think>[\s\S]*$/i, '').trim();
}

/** One chat completion. messages: [{role:'system'|'user'|'assistant', content}] */
export async function chat(messages, { temperature = 0.3 } = {}) {
  const c = aiConfig();
  if (!c) throw new AiError('AI is not set up on this server.');
  if (c.problems.length) throw new AiError(`AI is not set up correctly: ${c.problems.join('; ')}.`);
  const headers = { 'content-type': 'application/json' };
  if (c.apiKey) headers.authorization = `Bearer ${c.apiKey}`;
  if (c.provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.APP_ORIGIN?.split(',')[0] || 'http://localhost';
    headers['X-Title'] = process.env.APP_NAME || 'My Shop';
  }
  let res;
  try {
    res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST', headers, signal: AbortSignal.timeout(c.timeoutMs), redirect: 'error',
      body: JSON.stringify({ model: c.model, messages, temperature, max_tokens: c.maxTokens, stream: false }),
    });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new AiError('The AI model took too long to answer. Try again, or use a smaller/faster model.');
    throw new AiError(c.local
      ? `Could not reach the AI server at ${c.baseUrl}. Is ${c.label.replace(' (local)', '')} running, with the model "${c.model}" loaded?`
      : 'Could not reach the AI service. Please try again later.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.error?.message || body?.error || `status ${res.status}`;
    console.error(JSON.stringify({ level: 'error', msg: 'ai request failed', provider: c.provider, status: res.status, detail: String(detail).slice(0, 300) }));
    if (res.status === 401 || res.status === 403) throw new AiError('The AI service rejected the API key. Check AI_API_KEY.');
    if (res.status === 404) throw new AiError(`The AI model "${c.model}" was not found. Check AI_MODEL (for Ollama: ollama pull ${c.model}).`);
    if (res.status === 429) throw new AiError('The AI service is busy or out of credit. Try again later.');
    throw new AiError('The AI service returned an error.');
  }
  const text = cleanAnswer(body?.choices?.[0]?.message?.content);
  if (!text) throw new AiError('The AI model returned an empty answer.');
  return { text: text.slice(0, 20_000), model: body?.model || c.model, provider: c.label, local: c.local };
}
