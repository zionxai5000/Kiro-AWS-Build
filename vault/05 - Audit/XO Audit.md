---
tags: [audit, governance, xo-audit]
---

# XO Audit — Executive Officer Audit System

> Comprehensive, immutable audit trail of all system actions, decisions, and authority exercises.

## Purpose

Complete visibility into:
- What happened
- Who did it
- Why (authorization chain)
- When (timestamp)
- What was the outcome

## Audit Scope

| Category | What's Logged |
|----------|--------------|
| Actions | Every controlled action: agent, action type, target, authorization chain, outcome |
| Governance | Every Mishmar decision: auth checks, escalations, contract validations, token grants |
| Transitions | Every state change: state machine ID, prior state, new state, gate results |
| Security | Every credential access, authentication event, authorization failure |

## Retention

- 365-day minimum retention
- Immutable storage (no agent may modify or delete records)
- SHA-256 hash chain for tamper detection

## Querying

When live, you can filter by:
- Agent
- Time range
- Action type
- Pillar
- Outcome (success / failure / blocked)

## Current State

XO Audit schema is designed (DynamoDB table: `seraphim-audit-trail`). Event handlers to populate it are Phase 2 work.

## Related

- [[Mishmar]]
- [[Seraphim Core]]
- [[Governance Decisions]]
