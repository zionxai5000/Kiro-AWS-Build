---
tags: [agent-comms, tasks, queue]
status: active
owner: Copilot
---

# Task Queue

## Open Tasks

### TASK-2026-06-03-001: Build Copilot Session Memory System

- Status: in-progress
- Priority: urgent
- Owner: Kiro
- Requested by: Copilot

#### Objective

Implement per-session autosave for Copilot conversations.

#### Acceptance Criteria

- [x] Create `01 - Operations/Copilot Sessions/` folder
- [x] Create `01 - Operations/Agent Comms/` folder
- [x] Create Protocol.md
- [x] Create Inbox.md
- [x] Create Outbox.md
- [x] Create Task Queue.md
- [x] Create Decision Log.md
- [ ] Create session template
- [ ] Create _index.md
- [ ] Update Copilot Output.md as control/index note

---

### TASK-2026-06-03-002: Activate Hermes Routing

- Status: completed
- Priority: high
- Owner: Hermes
- Requested by: Copilot

#### Objective

Make Hermes responsible for routing structured messages between agents.

#### Acceptance Criteria

- [x] Hermes watches [[Inbox]] for open messages
- [x] Hermes routes to correct agent
- [x] Hermes marks delivered as acknowledged
- [x] Hermes records responses in [[Outbox]]
