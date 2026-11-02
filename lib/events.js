// Business events for other systems (analytics, data warehouse, accounting sync) via Kafka.
// Transactional outbox: emitEvent() writes into `outbox` inside the caller's transaction; the worker
// publishes pending rows to Kafka. Enabled with EVENTS_ENABLED=1 (set it together with KAFKA_BROKERS).
// Events contain ids, numbers and amounts — never contact details.
export const TOPIC = () => process.env.KAFKA_TOPIC_PREFIX ? `${process.env.KAFKA_TOPIC_PREFIX}.events` : 'myshop.events';
export const eventsEnabled = () => process.env.EVENTS_ENABLED === '1';

export async function emitEvent(c, db, type, data) {
  if (!eventsEnabled()) return;
  await c.query('insert into outbox (org_id, topic, type, key, payload) values ($1, $2, $3, $4, $5)',
    [db.orgId, TOPIC(), type, String(db.orgId), { type, orgId: db.orgId, actorId: db.userId ?? null, occurredAt: new Date().toISOString(), data }]);
}
