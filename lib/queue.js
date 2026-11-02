// Background jobs. Redis available -> BullMQ (fast, retries, schedules). Otherwise -> the Postgres
// `jobs` table with FOR UPDATE SKIP LOCKED (safe with many workers). Payloads in Postgres are encrypted.
import { createRequire } from 'node:module';
import { getPool } from './db.js';
import { bullConnection } from './redis.js';
import { encryptField, decryptField } from './crypto.js';
import { log } from './log.js';
import { metrics } from './metrics.js';

const require = createRequire(import.meta.url);
const QUEUE = 'myshop';
let bullQueue = null;
let bullConn = null;

function bull() {
  if (!process.env.REDIS_URL) return null;
  if (!bullQueue) {
    const { Queue } = require('bullmq');
    bullConn = bullConnection();
    bullQueue = new Queue(QUEUE, { connection: bullConn, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
  }
  return bullQueue;
}

export async function enqueue(name, payload = {}, { delayMs = 0 } = {}) {
  const q = bull();
  if (q) { await q.add(name, payload, { delay: delayMs }); return; }
  await getPool().query('insert into jobs (name, payload, run_at) values ($1, $2, now() + make_interval(secs => $3))',
    [name, encryptField(JSON.stringify(payload)), delayMs / 1000]);
}

/** Process due Postgres jobs once; returns how many ran. Used by the worker loop and tests. */
export async function runPgJobsOnce(handlers, { workerId = 'worker', batch = 10 } = {}) {
  const client = await getPool().connect();
  let jobs = [];
  try {
    await client.query('begin');
    jobs = (await client.query(
      `select id, name, payload, attempts, max_attempts from jobs where done_at is null and run_at <= now() and attempts < max_attempts
        order by run_at limit $1 for update skip locked`, [batch])).rows;
    if (jobs.length) await client.query('update jobs set locked_at = now(), locked_by = $2, attempts = attempts + 1 where id = any($1::bigint[])', [jobs.map((j) => j.id), workerId]);
    await client.query('commit');
  } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
  for (const j of jobs) {
    try {
      const h = handlers[j.name];
      if (!h) throw new Error(`no handler for ${j.name}`);
      await h(JSON.parse(decryptField(j.payload) || '{}'));
      // Payloads can contain email links; wipe them as soon as the job is done.
      await getPool().query("update jobs set done_at = now(), payload = '', last_error = null where id = $1", [j.id]);
      metrics.jobs.inc({ job: j.name, result: 'ok' });
    } catch (e) {
      const backoff = Math.min(2 ** (j.attempts + 1) * 5, 3600);
      await getPool().query('update jobs set last_error = $2, run_at = now() + make_interval(secs => $3), locked_at = null where id = $1', [j.id, e.message.slice(0, 500), backoff]);
      metrics.jobs.inc({ job: j.name, result: 'error' });
      log.warn('job failed', { job: j.name, id: Number(j.id), attempt: j.attempts + 1, error: e.message });
    }
  }
  return jobs.length;
}

export async function purgeFinishedJobs() {
  await getPool().query("delete from jobs where (done_at is not null and done_at < now() - interval '7 days') or (attempts >= max_attempts and created_at < now() - interval '30 days')");
}

export async function closeQueue() {
  if (bullQueue) { await bullQueue.close(); bullQueue = null; }
  if (bullConn) { await bullConn.quit().catch(() => {}); bullConn = null; }
}
