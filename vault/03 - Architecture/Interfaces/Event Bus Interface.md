---
tags: [architecture, interface, event-bus, messaging]
---

# Event Bus Interface

> Asynchronous messaging backbone connecting all system components. EventBridge for routing, SQS for reliable delivery.

## Interface

```typescript
interface EventBusService {
  publish(event: SystemEvent): Promise<string>;
  publishBatch(events: SystemEvent[]): Promise<string[]>;
  subscribe(pattern: EventPattern, handler: EventHandler): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;
  getDeadLetterMessages(filter?: DLQFilter): Promise<DeadLetterMessage[]>;
  retryDeadLetter(messageId: string): Promise<void>;
}
```

## Event Structure

```typescript
interface SystemEvent {
  source: string;       // e.g., "eretz", "zionx", "mishmar"
  type: string;         // e.g., "directive.enriched", "app.submitted"
  detail: Record<string, unknown>;
  metadata: {
    tenantId: string;
    correlationId: string;
    timestamp: Date;
  };
}
```

## Guarantees

- **At-least-once delivery** — messages will be delivered, may be duplicated
- **Message ordering** — maintained within a single topic partition (FIFO queues)
- **Schema validation** — JSON Schema validated before accepting for delivery
- **Dead letter queue** — messages that fail delivery after retry limit go to DLQ
- **Retry limit** — configurable, default 3 attempts with exponential backoff

## Event Types (Examples)

| Event | Source | Trigger |
|-------|--------|---------|
| `directive.enriched` | eretz | Eretz finishes enriching a directive |
| `app.submitted` | zionx | App submitted to store |
| `app.rejected` | zionx | Store rejects an app |
| `trade.opened` | zion-alpha | New position opened |
| `governance.blocked` | mishmar | Action blocked by governance |
| `memory.stored` | zikaron | New memory entry created |
| `cost.threshold` | otzar | Budget threshold reached |

## Status

**Phase 1 — ✅ Implemented.** EventBridge bus configured, SQS queues active, schema validation via Ajv.

## Related

- [[Architecture Overview]]
- [[Technology Stack]]
