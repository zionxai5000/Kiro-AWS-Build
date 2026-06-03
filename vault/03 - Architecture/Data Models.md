---
tags: [architecture, data, database, models]
---

# Data Models

## Database (Aurora PostgreSQL + pgvector)

### Tables

| Table | Purpose |
|-------|---------|
| `tenants` | User/family units with config and status |
| `agent_programs` | Versioned agent definitions (JSONB) |
| `state_machine_definitions` | Declarative state machine configs (JSONB) |
| `state_machine_instances` | Running state machine instances with current state |
| `memory_entries` | 4-layer memory with 1536-dim vector embeddings |
| `completion_contracts` | JSON Schema output requirements per workflow |
| `token_usage` | Per-agent/model token consumption and cost tracking |

### Key Indexes

- `idx_memory_embedding` — HNSW index for fast vector similarity (cosine)
- `idx_memory_tenant_layer` — filtered vector search by tenant + layer
- `idx_token_usage_daily` — cost aggregation by agent per day

### Security

- Row-level security on ALL tables (tenant isolation at DB level)
- Credentials in Secrets Manager (never in code)
- Connection pooling with 5-minute credential cache

## DynamoDB

### seraphim-audit-trail
- Partition Key: `tenantId`
- Sort Key: `timestamp#recordId`
- GSIs: actionType, agentId, pillar
- TTL: 365 days
- Stream enabled for real-time monitoring

### seraphim-events
- Partition Key: `tenantId#source`
- Sort Key: `timestamp#eventId`
- GSIs: eventType, correlationId
- TTL: 90 days
- Stream enabled for event replay

## S3

- `seraphim-dashboard-live` — Static React dashboard
- Agent artifacts, logs, generated assets

## Related

- [[Technology Stack]]
- [[Architecture Overview]]
- [[Phase 1 - Complete]]
