// Deletes expired sessions, old login attempts and used/expired reset tokens.
// Run daily (cron / scheduler): DATABASE_URL=... node scripts/cleanup.mjs
import { purgeExpiredSessions } from '../lib/auth/session.js';
import { getPool } from '../lib/db.js';

await purgeExpiredSessions();
await getPool().end();
console.log('cleanup done');
