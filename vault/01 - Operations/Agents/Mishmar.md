---
tags: [agent, system-service, mishmar, governance]
pillar: Governance
authority_level: L1
status: ready
---

# Mishmar — Governance Enforcement

> Governance as code. Every governance rule has a runtime enforcement mechanism. No rule exists only on paper.

## Role

- Enforce authority levels (L1-L4) at runtime
- Block unauthorized actions and route escalations
- Validate Completion Contracts before allowing workflow completion
- Issue and validate Execution Tokens
- Enforce role separation (no agent decides AND executes same action)
- Log all governance decisions to [[XO Audit]]

## Authority Matrix

| Level | Who | Scope |
|-------|-----|-------|
| L1 | King | Strategic decisions, budget >20%, new pillar activation |
| L2 | Seraphim / Designated authority | Budget reallocations <20%, cross-pillar conflicts |
| L3 | Peer verification | Standard workflows, code review equivalents |
| L4 | Autonomous | Within defined bounds, no approval needed |

## Enforcement Mechanisms

- **Execution Tokens**: Dual-approval required (authorizer + Otzar budget check)
- **Completion Contracts**: JSON Schema validation of workflow outputs
- **Role Separation**: Same agent cannot decide AND execute controlled actions
- **Escalation Routing**: Blocked actions automatically route to next authority level
