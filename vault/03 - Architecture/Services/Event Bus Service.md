---
tags: [architecture, services, event-bus, messaging]
updated: 2025-01-20
---

# Event Bus Service

> Central nervous system for asynchronous communication between all SeraphimOS components.

## Overview

The Event Bus provides schema-validated, content-routed messaging across the entire platform. Built on AWS EventBridge + SQS with dead-letter queue support.

Package: `packages/services/src/event-bus/service.ts`

---

## Interface

```typescript
interface EventBusService {
  publish(event: SeraphimEvent): Promise<string>
  publishBatch(events: SeraphimEvent[]): Promise<string[]>
  subscribe(pattern: EventPattern, target: string): Promise<void>
  getDeadLetterMessages(): Promise<DeadLetterMessage[]>
  retryDeadLetter(messageId: string): Promise<void>
}
```

## Architecture

| Component | AWS Service | Purpose |
|-----------|-------------|---------|
| Event Bus | EventBridge (`seraphim-events`) | Content-based routing |
| Audit Queue | SQS FIFO | Ordered audit events |
| Memory Queue | SQS Standard | Memory storage events |
| Alert Queue | SQS Standard | Alert notifications |
| Workflow Queue | SQS Standard | State machine transitions |
| Learning Queue | SQS Standard | Learning engine events |
| Reference Queue | SQS Standard | Reference ingestion events |
| Dead Letter Queue | SQS | Failed messages after retry exhaustion |

## Event Schema (SeraphimEvent)

All events are validated against JSON Schema (Ajv) before acceptance:

```typescript
interface SeraphimEvent {
  id: string
  source: string           // e.g., "agent-runtime", "vault-sync"
  type: string             // e.g., "agent.task.completed"
  detail: Record<string, unknown>
  metadata: {
    tenantId: string
    correlationId: string
    timestamp: string
  }
}
```

## Key Event Types

| Event | Source | Consumers |
|-------|--------|-----------|
| `agent.task.completed` | Agent Runtime | Learning Engine, Otzar |
| `agent.task.failed` | Agent Runtime | Learning Engine, Alerts |
| `audit.entry.created` | XO Audit | Dashboard |
| `sme.heartbeat.completed` | Heartbeat Scheduler | SME Handler |
| `recommendation.submitted` | Recommendation Engine | Dashboard, Shaar |
| `vault.directive.activated` | Vault Sync | Seraphim Core |
| `vault.recommendation.approved` | Vault Sync | Recommendation Engine |
| `baseline.updated` | Baseline Storage | Quality Gate, Training |
| `reference.ingested` | Reference Ingestion | Dashboard |
| `video.published` | ZXMG Pipeline | Analytics, Event Bus |
| `app.submission.ready` | ZionX Studio | Mishmar approval |

## Related

- [[Architecture Overview]]
- [[XO Audit Service]]
- [[Zikaron Memory Service]]
- [[Vault Sync Service]]
