// Daily summary for every business: in-app notification for accountants+ and an email to those who
// opted in. Schedule once a day, e.g. 8:30 am:  30 8 * * *  cd /app && npm run notify:daily
import { runDailySummaries } from '../lib/services/notifications.js';
import { getPool } from '../lib/db.js';

const r = await runDailySummaries({ origin: process.env.APP_ORIGIN?.split(',')[0] ?? '' });
console.log(`daily summary: ${r.sent} of ${r.organizations} businesses had activity`);
await getPool().end();
