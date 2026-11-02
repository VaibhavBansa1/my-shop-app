// Kafka publisher for the outbox (official Confluent client, KafkaJS-compatible API, librdkafka inside).
//   KAFKA_BROKERS=host1:9092,host2:9092   KAFKA_CLIENT_ID=myshop
//   KAFKA_SSL=1  KAFKA_SASL_MECHANISM=plain|scram-sha-256|scram-sha-512  KAFKA_USERNAME  KAFKA_PASSWORD
import { createRequire } from 'node:module';
import { getPool } from './db.js';
import { log, errText } from './log.js';
import { metrics } from './metrics.js';

const require = createRequire(import.meta.url);
let producer = null;

export const kafkaConfigured = () => Boolean(process.env.KAFKA_BROKERS);

async function getProducer() {
  if (producer) return producer;
  const { Kafka } = require('@confluentinc/kafka-javascript').KafkaJS;
  const kafkaJS = { clientId: process.env.KAFKA_CLIENT_ID || 'myshop', brokers: process.env.KAFKA_BROKERS.split(',').map((s) => s.trim()) };
  if (process.env.KAFKA_SSL === '1') kafkaJS.ssl = true;
  if (process.env.KAFKA_SASL_MECHANISM) {
    kafkaJS.sasl = { mechanism: process.env.KAFKA_SASL_MECHANISM, username: process.env.KAFKA_USERNAME, password: process.env.KAFKA_PASSWORD };
  }
  const p = new Kafka({ kafkaJS }).producer({ kafkaJS: { idempotent: true, acks: -1 } });
  await p.connect();
  producer = p;
  return p;
}

/** Publish up to `batch` pending outbox rows. Order is kept per business (message key = orgId). */
export async function publishOutboxOnce({ batch = 500, send } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      'select id, topic, key, payload from outbox where published_at is null order by id limit $1 for update skip locked', [batch]);
    if (!rows.length) { await client.query('commit'); return 0; }
    try {
      const doSend = send ?? (async (topic, messages) => (await getProducer()).send({ topic, messages }));
      const byTopic = {};
      for (const r of rows) (byTopic[r.topic] ??= []).push({ key: r.key, value: JSON.stringify({ eventId: Number(r.id), ...r.payload }) });
      for (const [topic, messages] of Object.entries(byTopic)) await doSend(topic, messages);
      await client.query('update outbox set published_at = now(), attempts = attempts + 1, last_error = null where id = any($1::bigint[])', [rows.map((r) => r.id)]);
      metrics.jobs.inc({ job: 'outbox.publish', result: 'ok' }, rows.length);
    } catch (e) {
      await client.query('update outbox set attempts = attempts + 1, last_error = $2 where id = any($1::bigint[])', [rows.map((r) => r.id), errText(e)]);
      metrics.jobs.inc({ job: 'outbox.publish', result: 'error' });
      log.warn('outbox publish failed (will retry)', { count: rows.length, error: errText(e) });
      await client.query('commit');
      return -1;
    }
    await client.query('commit');
    return rows.length;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function purgePublishedOutbox() {
  await getPool().query("delete from outbox where published_at < now() - interval '7 days'");
}

export async function closeKafka() { if (producer) { await producer.disconnect().catch(() => {}); producer = null; } }
