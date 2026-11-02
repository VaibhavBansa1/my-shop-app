// Background worker: emails, daily summary, cleanup. Run alongside the web app:  npm run worker
// With REDIS_URL -> BullMQ (+ cron schedules). Without -> polls the Postgres jobs table.
// Health/metrics on WORKER_PORT (default 9091): GET /healthz, GET /metrics (Bearer METRICS_TOKEN).
import http from 'node:http';
import { log, errText } from '../lib/log.js';
import { createRequire } from 'node:module';
import { handlers, schedules, enqueueDueSchedules } from '../lib/jobs.js';
import { enqueue, runPgJobsOnce, closeQueue } from '../lib/queue.js';
import { bullConnection, closeRedis } from '../lib/redis.js';
import { getPool } from '../lib/db.js';
import { metrics } from '../lib/metrics.js';
import { kafkaConfigured, publishOutboxOnce, closeKafka } from '../lib/kafka.js';

const require = createRequire(import.meta.url);
const workerId = `${process.env.HOSTNAME || 'worker'}-${process.pid}`;
let stopping = false; let lastTick = Date.now(); let bullWorker = null;

if (process.env.REDIS_URL) {
  const { Worker, Queue } = require('bullmq');
  const connection = bullConnection();
  bullWorker = new Worker('myshop', async (job) => {
    lastTick = Date.now();
    const h = handlers[job.name];
    if (!h) throw new Error(`no handler for ${job.name}`);
    await h(job.data);
    metrics.jobs.inc({ job: job.name, result: 'ok' });
  }, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 5) });
  bullWorker.on('failed', (job, err) => { metrics.jobs.inc({ job: job?.name ?? 'unknown', result: 'error' }); log.warn('job failed', { job: job?.name, error: errText(err) }); });
  const q = new Queue('myshop', { connection: bullConnection() });
  for (const s of schedules) await q.upsertJobScheduler(s.name, { pattern: s.cron, tz: process.env.SCHEDULE_TZ || 'Asia/Kolkata' }, { name: s.name });
  await q.close();
  setInterval(() => { lastTick = Date.now(); }, 5000).unref();
  log.info('worker started', { mode: 'bullmq', workerId });
} else {
  (async function loop() {
    log.info('worker started', { mode: 'postgres', workerId });
    let lastScheduleCheck = 0;
    while (!stopping) {
      lastTick = Date.now();
      try {
        if (Date.now() - lastScheduleCheck > 60_000) { await enqueueDueSchedules(enqueue); lastScheduleCheck = Date.now(); }
        const n = await runPgJobsOnce(handlers, { workerId });
        if (!n) await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        log.error('worker loop error', { error: errText(e) });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}

// Kafka outbox relay: publishes business events every second when KAFKA_BROKERS is set.
if (kafkaConfigured()) {
  log.info('kafka outbox relay on', { brokers: process.env.KAFKA_BROKERS });
  (async function relay() {
    while (!stopping) {
      const n = await publishOutboxOnce().catch((e) => { log.warn('outbox relay error', { error: errText(e) }); return -1; });
      if (n <= 0) await new Promise((r) => setTimeout(r, n < 0 ? 5000 : 1000));
    }
  })();
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') {
    const ok = Date.now() - lastTick < 120_000;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok }));
  }
  if (req.url === '/metrics' && process.env.METRICS_TOKEN && req.headers.authorization === `Bearer ${process.env.METRICS_TOKEN}`) {
    res.writeHead(200, { 'content-type': metrics.registry.contentType }); return res.end(await metrics.registry.metrics());
  }
  res.writeHead(404); res.end();
}).listen(Number(process.env.WORKER_PORT || 9091));

async function shutdown(sig) {
  if (stopping) return; stopping = true;
  log.info('worker stopping', { signal: sig });
  server.close();
  await bullWorker?.close();
  await closeQueue(); await closeRedis(); await closeKafka(); await getPool().end().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
