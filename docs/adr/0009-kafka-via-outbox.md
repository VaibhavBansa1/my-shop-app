# ADR-0009: Kafka only for outgoing business events, through a transactional outbox

**Status:** Accepted
**Date:** 2026-11-02
**Deciders:** Vaibhav Bansal (owner)

## Context
The owner asked whether to add Kafka. The app already has a job queue (BullMQ on Redis, or Postgres).
Kafka is a distributed log for streaming events between many systems at very high volume.

## Decision
Do not use Kafka for the app's own work (emails, schedules, OCR) — the job queue is simpler and enough.
Use Kafka (optional) to **publish business events** to other systems: `voucher.created`,
`voucher.cancelled`, `item.created`, `stock.low`, `import.completed`.
Events are written to an `outbox` table **in the same database transaction** as the change; the worker
publishes them with an idempotent producer (acks=all), keyed by business so each business's events stay
in order. Off unless `EVENTS_ENABLED=1` and `KAFKA_BROKERS` are set.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| **Outbox + Kafka (chosen)** | No lost or phantom events; works when Kafka is down; app stays simple | Events arrive ~1 s later |
| Publish to Kafka directly in the request | Lowest latency | Event lost if Kafka is down; event sent for a rolled-back change |
| Kafka as the job queue too | One system | Heavy to run for a shop; poor fit for scheduled jobs and retries per job |
| No Kafka | Simplest | Integrations would poll the API |

## Consequences
- Integrations (analytics, warehouse, ERP sync) subscribe to `<prefix>.events` without touching the app.
- At-least-once delivery: consumers should de-duplicate by `eventId`.
- Events carry ids and amounts only — never contact details (privacy).
- Client: the official Confluent library (librdkafka) — KafkaJS is no longer maintained.
