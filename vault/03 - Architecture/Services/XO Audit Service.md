---
tags: [service, xo-audit, audit, immutable, architecture]
source: system
date: 2026-06-02
---

# XO Audit Service

> Immutable audit trail with SHA-256 hash chain for tamper-evident integrity.

## Purpose

Records every controlled action, governance decision, and state transition in a DynamoDB-backed immutable log. Provides cryptographic verification that no record has been altered.

## Core Capabilities

### Recording
- **Actions (Req 7.1)**: Acting agent, action type, target, authorization chain, timestamp, outcome
- **Governance Decisions (Req 7.2)**: Authorization checks, escalations, completion contract validations, token grants
- **State Transitions (Req 7.3)**: State machine ID, prior/new state, gate results, triggering event

### Hash Chain Integrity
- Each record includes SHA-256 hash of all its fields + previousHash
- First record in tenant chain uses genesis hash (64 zeros)
- Walking backward through chain verifies no tampering

### Querying (Req 7.4)
- Filter by agent (GSI2), action type (GSI1), pillar (GSI3)
- Time range filtering on sort key
- Outcome filtering (success/failure/blocked)
- Cursor-based pagination

### Immutability Verification (Req 7.5)
- `verifyIntegrity(recordId)` walks the hash chain backward
- Reports chain length and break point if tampered
- 365-day TTL retention minimum

## DynamoDB Schema

| Key | Type | Description |
|-----|------|-------------|
| tenantId (PK) | S | Tenant partition |
| sk (SK) | S | `{timestamp}#{recordId}` |
| recordId | S | UUID |
| hash | S | SHA-256 of record content |
| previousHash | S | Hash of prior record |
| expiresAt | N | TTL (365 days) |

### GSIs
- `agentId-index` — query by acting agent
- `actionType-index` — query by action type
- `pillar-index` — query by pillar
- `recordId-index` — lookup by ID

## Event Publishing

Every audit record publishes an `audit.entry.created` event to the Event Bus for real-time monitoring.

## Requirements Covered

7.1, 7.2, 7.3, 7.4, 7.5

## Location

`packages/services/src/xo-audit/service.ts`

## Related

- [[Mishmar Governance Service]]
- [[Architecture Overview]]
- [[05 - Audit/XO Audit]]
