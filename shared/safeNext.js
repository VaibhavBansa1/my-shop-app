// Where to go after signing in. Only same-site paths are allowed (prevents open redirects).
// Parsed with the URL parser the browser itself uses, so tricks like "/\t/evil.com" (browsers drop tabs and
// newlines, turning it into "//evil.com") or "/\\evil.com" resolve to another origin and are refused.
export const DEFAULT_NEXT = '/orgs?auto=1';

export function safeNextPath(next, origin) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2000) return DEFAULT_NEXT;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return DEFAULT_NEXT;   // control characters or backslashes: never legitimate
  try {
    const u = new URL(next, origin);
    if (u.origin !== new URL(origin).origin) return DEFAULT_NEXT;
    return u.pathname + u.search + u.hash;
  } catch { return DEFAULT_NEXT; }
}
