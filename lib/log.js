// Structured JSON logs (one line per event) for any log collector (Loki, CloudWatch, ELK…).
// LOG_LEVEL=debug|info|warn|error (default info). Never log secrets, tokens, passwords or bodies.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = () => LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? 20;

function write(level, msg, fields = {}) {
  if (LEVELS[level] < min()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const log = {
  debug: (m, f) => write('debug', m, f), info: (m, f) => write('info', m, f),
  warn: (m, f) => write('warn', m, f), error: (m, f) => write('error', m, f),
};
