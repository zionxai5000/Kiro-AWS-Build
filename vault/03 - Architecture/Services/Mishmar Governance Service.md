---
tags: [service, governance, mishmar, security, architecture]
source: system
date: 2026-06-02
---

# Mishmar Governance Service

> Runtime governance enforcement — the system's security backbone.

## Purpose

Mishmar enforces authorization, role separation, execution token management, and completion contract validation. Every governance decision is logged to [[XO Audit Service]].

## Core Capabilities

### Authorization (L1–L4 Authority Matrix)
- Maps agent authority levels: L1 (King) → L4 (Worker)
- Blocks actions exceeding agent authority
- Routes escalation requests up the chain
- Checks allowed/denied action lists per agent

### Role Separation
- Enforces that no agent both decides AND executes the same action
- Validates workflow step assignments for conflicts
- Prevents single-agent control over controlled operations

### Execution Tokens
- Issues time-limited tokens (default 5 min expiry)
- Requires both authority check AND Otzar budget approval
- Validates token ownership, expiry, and action match
- In-memory token store (production: DB/cache)

### Completion Contracts
- Validates workflow outputs against JSON Schema (using Ajv)
- Rejects completion on schema violations with detailed error paths
- Logs all validation decisions to XO Audit

## Configuration

```typescript
interface MishmarServiceConfig {
  tenantId: string;
  auditService: XOAuditService;
  otzarService: OtzarService;
  tokenExpiryMs?: number; // default: 5 minutes
  getAgentAuthority: (agentId: string) => Promise<AgentAuthorityInfo | null>;
  getActionRequirement: (action: string) => Promise<AuthorityLevel>;
  getCompletionContract: (workflowId: string) => Promise<CompletionContract | null>;
}
```

## Authority Levels

| Level | Rank | Description |
|-------|------|-------------|
| L1 | 1 | King — full authority |
| L2 | 2 | Pillar lead — strategic decisions |
| L3 | 3 | Sub-agent — operational execution |
| L4 | 4 | Worker — limited scope tasks |

## Requirements Covered

3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

## Location

`packages/services/src/mishmar/service.ts`

## Related

- [[Otzar Resource Manager]]
- [[XO Audit Service]]
- [[Chain of Command]]
- [[Architecture Overview]]
