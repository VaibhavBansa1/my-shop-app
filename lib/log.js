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

/**
 * Error text that is safe to log. Postgres messages and details can quote stored values ("Key (name)=(Ramesh
 * Traders) already exists"), which would copy business data into logs; for database errors only the error code,
 * constraint and table are kept.
 */
export function errText(e) {
  if (!e) return String(e);
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && (e.severity || e.routine)) {
    return `postgres ${e.code}${e.constraint ? ` constraint=${e.constraint}` : ''}${e.table ? ` table=${e.table}` : ''}`;
  }
  return String(e.message ?? e).slice(0, 500);
}
/** Stack without the first line (which repeats the message); none for database errors. */
export const errStack = (e) => (e && typeof e.code === 'string' && (e.severity || e.routine) ? undefined : e?.stack?.split('\n').slice(1, 12).join('\n'));
