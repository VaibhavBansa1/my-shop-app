// Job handlers and schedules shared by the worker (BullMQ or Postgres mode).
import { getPool } from './db.js';
import { sendEmail } from './email.js';
import { runDailySummaries } from './services/notifications.js';
import { purgeExpiredSessions } from './auth/session.js';
import { purgeFinishedJobs } from './queue.js';
import { flagEnabled } from './flags.js';

export const handlers = {
  'email.send': async (msg) => {
    const r = await sendEmail(msg);
    if (!r.ok && !r.logged) throw new Error('email not delivered');
  },
  'daily_summary.run': async () => {
    if (!(await flagEnabled('daily_summary'))) return;
    await runDailySummaries({ origin: process.env.APP_ORIGIN?.split(',')[0] ?? '' });
  },
  'cleanup.run': async () => {
    await purgeExpiredSessions();
    await purgeFinishedJobs();
    await getPool().query('select purge_old_notifications()');
    await getPool().query('select purge_old_security_events($1)', [Number(process.env.SECURITY_LOG_RETENTION_DAYS || 365)]);
    await getPool().query("delete from scheduled_runs where at < now() - interval '60 days'");
  },
};

// Times are in SCHEDULE_TZ (default Asia/Kolkata).
export const schedules = [
  { name: 'daily_summary.run', cron: process.env.DAILY_SUMMARY_CRON || '30 8 * * *', hour: 8, minute: 30 },
  { name: 'cleanup.run', cron: '15 3 * * *', hour: 3, minute: 15 },
];

/** Postgres mode: local wall-clock time in the schedule time zone. */
export function zonedNow(tz = process.env.SCHEDULE_TZ || 'Asia/Kolkata', d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

/** Postgres mode: enqueue each daily job once per day after its time (safe with many workers). */
export async function enqueueDueSchedules(enqueue, now = zonedNow()) {
  let n = 0;
  for (const s of schedules) {
    if (now.hour * 60 + now.minute < s.hour * 60 + s.minute) continue;
    const { rowCount } = await getPool().query('insert into scheduled_runs (name, period) values ($1, $2) on conflict do nothing', [s.name, now.date]);
    if (rowCount) { await enqueue(s.name, {}); n++; }
  }
  return n;
}
