---
tags: [architecture, phase, phase-2, not-started]
status: "⬜ Not Started"
aliases: [Phase 2]
---

# Phase 2 — System Services

**Status: ⬜ Not Started**

## What Will Be Built

### Mishmar (Governance)
- Authority enforcement (L1-L4 matrix with escalation routing)
- Role separation (prevent decide-and-execute by same agent)
- Execution Tokens (dual-approval: authorizer + Otzar)
- Completion Contracts (JSON Schema validation of workflow outputs)
- Governance audit trail (every decision logged)

### Zikaron (Memory)
- 4-layer memory (episodic, semantic, procedural, working)
- Vector search (cosine similarity via pgvector)
- Entity extraction (auto-extract from episodic → semantic)
- Agent context loading (working + recent episodic + procedural on startup)
- Conflict resolution (flag conflicts, retain both entries)

### Otzar (Resource Management)
- Task classification (type + complexity → tier selection)
- Model routing (3-tier: Haiku → Sonnet → Opus)
- Budget enforcement (daily + monthly limits per agent/pillar/system)
- Semantic caching (task-type-aware cache with differentiated TTLs)
- Cost reporting (per-agent/pillar spend, waste detection)

### XO Audit
- Immutable audit trail (SHA-256 hash chain)
- Rich querying (filter by agent, action, pillar, time, outcome)
- Integrity verification (walk hash chain to detect tampering)
- 365-day retention (DynamoDB TTL)

### Event Processing
- Audit event handler (process events, maintain hash chain)
- Memory event handler (trigger entity extraction)
- Alert event handler (format and deliver notifications)
- Workflow event handler (trigger next state machine steps)
- Idempotent processing (deduplication by event ID)

## Dependencies

Requires [[Phase 1 - Complete|Phase 1]] infrastructure (Aurora, EventBridge, SQS, ECS).

## Related

- [[Capability Map]]
- [[Zikaron Interface]]
- [[Architecture Overview]]
