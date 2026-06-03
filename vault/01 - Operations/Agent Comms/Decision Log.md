---
tags: [agent-comms, decisions, copilot]
status: active
owner: Copilot
---

# Decision Log

## Decisions

### DEC-2026-06-03-001: Use per-session Copilot memory notes

- Date: 2026-06-03
- Decider: User (The King)
- Captured by: Copilot
- Status: accepted

#### Decision

Copilot conversations saved as individual session notes instead of one large log.

#### Rationale

The user does not need a human interface for reading logs. Prioritize durable agent memory, structured persistence, and machine-readable coordination.

#### Consequences

- [[Copilot Output]] becomes an index/control note
- Full records in `01 - Operations/Copilot Sessions/`
- Copilot owns protocol
- Kiro implements autosave
- Hermes handles routing

---

### DEC-2026-06-03-002: Copilot owns the communication protocol

- Date: 2026-06-03
- Decider: User (The King)
- Captured by: Copilot
- Status: accepted

#### Decision

Copilot owns conversation-memory and inter-agent communication protocol semantics. Kiro implements. Hermes routes.

---

### DEC-2026-06-03-003: Vault is the unified agent brain

- Date: 2026-06-02
- Decider: User (The King)
- Captured by: Kiro
- Status: accepted

#### Decision

All agents (Kiro, Copilot, Hermes, Docker agents, AWS agents) communicate through the shared Obsidian vault. The vault is the single source of truth.

#### Consequences

- Vault-sync publishes changes to EventBridge
- Obsidian REST API enables programmatic access
- All agent output written as vault markdown files
- King reviews in Obsidian (<15 min/day)
