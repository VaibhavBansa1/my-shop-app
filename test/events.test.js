// Transactional outbox + Kafka. The Kafka round trip runs when TEST_KAFKA_BROKERS is set (CI / local broker).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, OWNER_URL } from './helpers.js';
import pg from 'pg';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
process.env.EVENTS_ENABLED = '1';
process.env.KAFKA_TOPIC_PREFIX = `test${Date.now()}`;
before(setupDb);
after(async () => { const { closeKafka } = await import('../lib/kafka.js'); await closeKafka(); await closePool(); });
const owner = async (sql, p) => { const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); try { return await c.query(sql, p); } finally { await c.end(); } };

async function shop() {
  const { db } = await makeUserOrg();
  const m = await import('../lib/services/masters.js');
  const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(db, { name: 'Pen', unitId: pcs, salePrice: 10, openingQty: 6, openingRate: 5, reorderLevel: 5 });
  return { db, item };
}

test('events are written in the same transaction (rolled-back changes publish nothing) and carry no contact data', async () => {
  const { createVoucher, cancelVoucher } = await import('../lib/services/vouchers.js');
  await owner('delete from outbox');
  const { db, item } = await shop();
  const today = new Date().toISOString().slice(0, 10);
  const v = await createVoucher(db, { type: 'sales', date: today, reference: '', narration: '', items: [{ stockItemId: item.id, qty: 2, rate: 10 }], entries: [] });
  await assert.rejects(createVoucher(db, { type: 'sales', date: today, reference: '', narration: '', items: [{ stockItemId: item.id, qty: 0, rate: 10 }], entries: [] }));
  await cancelVoucher(db, v.id, 'mistake');
  const rows = (await owner('select type, key, payload from outbox order by id')).rows;
  assert.deepEqual(rows.map((r) => r.type), ['item.created', 'voucher.created', 'stock.low', 'voucher.cancelled']);
  assert.ok(rows.every((r) => r.key === db.orgId), 'keyed by business (ordering per business)');
  const created = rows[1].payload;
  assert.equal(created.data.total, '20.00');
  assert.equal(created.data.items[0].stockQty, '-2.000');
  assert.ok(!JSON.stringify(rows).match(/@|phone|address/i), 'no contact details in events');
});

test('publisher marks rows sent, keeps them on failure, and retries', async () => {
  const { publishOutboxOnce } = await import('../lib/kafka.js');
  await owner('delete from outbox');
  const { db, item } = await shop();
  const { createVoucher } = await import('../lib/services/vouchers.js');
  await createVoucher(db, { type: 'sales', date: new Date().toISOString().slice(0, 10), reference: '', narration: '', items: [{ stockItemId: item.id, qty: 1, rate: 10 }], entries: [] });
  const fail = await publishOutboxOnce({ send: async () => { throw new Error('broker down'); } });
  assert.equal(fail, -1);
  let pending = (await owner('select count(*)::int n, max(attempts) a, max(last_error) e from outbox where published_at is null')).rows[0];
  assert.equal(pending.n, 3, 'item.created, voucher.created, stock.low'); assert.equal(pending.a, 1); assert.match(pending.e, /broker down/);
  const sent = [];
  assert.equal(await publishOutboxOnce({ send: async (topic, msgs) => { sent.push(...msgs.map((x) => ({ topic, ...x }))); } }), 3);
  pending = (await owner('select count(*)::int n from outbox where published_at is null')).rows[0];
  assert.equal(pending.n, 0);
  assert.equal(sent[0].topic, `${process.env.KAFKA_TOPIC_PREFIX}.events`);
  const ev = JSON.parse(sent[1].value);
  assert.equal(ev.type, 'voucher.created'); assert.ok(ev.eventId > 0);
});

test('real Kafka round trip', { skip: !process.env.TEST_KAFKA_BROKERS && 'set TEST_KAFKA_BROKERS to run' }, async () => {
  process.env.KAFKA_BROKERS = process.env.TEST_KAFKA_BROKERS;
  const { publishOutboxOnce } = await import('../lib/kafka.js');
  const { Kafka } = (await import('@confluentinc/kafka-javascript')).KafkaJS;
  await owner('delete from outbox');
  const { db, item } = await shop();
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const v = await createVoucher(db, { type: 'sales', date: new Date().toISOString().slice(0, 10), reference: '', narration: '', items: [{ stockItemId: item.id, qty: 1, rate: 10 }], entries: [] });
  for (let i = 0; i < 20 && (await publishOutboxOnce()) !== 0; i++);
  const kafka = new Kafka({ kafkaJS: { brokers: [process.env.KAFKA_BROKERS] } });
  const consumer = kafka.consumer({ kafkaJS: { groupId: `t${Date.now()}`, fromBeginning: true } });
  await consumer.connect();
  await consumer.subscribe({ topic: `${process.env.KAFKA_TOPIC_PREFIX}.events` });
  const got = [];
  await consumer.run({ eachMessage: async ({ message }) => { got.push(JSON.parse(message.value.toString())); } });
  for (let i = 0; i < 100 && !got.some((e) => e.type === 'voucher.created'); i++) await new Promise((r) => setTimeout(r, 200));
  await consumer.disconnect();
  const ev = got.find((e) => e.type === 'voucher.created');
  assert.ok(ev, `received events: ${got.map((e) => e.type).join(',')}`);
  assert.equal(ev.data.voucherId, v.id);
  assert.equal(ev.orgId, db.orgId);
  delete process.env.KAFKA_BROKERS;
});
