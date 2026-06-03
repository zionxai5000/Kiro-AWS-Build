---
tags: [agent-comms, protocol, copilot, kiro, hermes]
status: active
owner: Copilot
---

# Agent Communication Protocol

## Purpose

This protocol defines how Copilot, Kiro, Hermes, and future agents communicate through the Obsidian vault.

## Agents

### Copilot
- Owns conversation memory protocol
- Owns session note schema
- Summarizes conversations
- Extracts decisions and tasks
- Writes directives for other agents
- Interprets vault context semantically

### Kiro
- Implements API/filesystem automation
- Creates session notes
- Appends user and Copilot turns
- Updates indexes
- Maintains persistence hooks
- Executes implementation tasks

### Hermes
- Routes agent messages
- Watches inbox/outbox/task files
- Marks delivery status
- Escalates blockers
- Coordinates notifications

## Communication Files

- [[Inbox]]: open messages directed to agents
- [[Outbox]]: responses or completed outbound messages
- [[Task Queue]]: actionable implementation or operational tasks
- [[Decision Log]]: durable decisions made by User, Copilot, Kiro, or Hermes

## Message Schema

```json
{
  "id": "YYYY-MM-DDTHH-mm-ssZ-from-to-topic",
  "from": "Copilot",
  "to": "Kiro",
  "type": "directive",
  "priority": "normal",
  "status": "open",
  "created": "YYYY-MM-DDTHH:mm:ssZ",
  "context": [],
  "message": "",
  "requested_action": "",
  "response_required": true,
  "response": null
}
```

## Message Types

- directive, question, status, decision, blocker, handoff, log, escalation

## Priority Levels

- low, normal, high, urgent

## Status Values

- open, acknowledged, in-progress, completed, blocked, cancelled

## Routing Rules

- Copilot writes semantic messages
- Hermes routes messages with `"status": "open"`
- Hermes changes routed messages to `"acknowledged"` when delivered
- Kiro changes implementation messages to `"in-progress"` when started
- Completed work reported in [[Outbox]]
- Durable decisions mirrored into [[Decision Log]]
- Actionable work mirrored into [[Task Queue]]

## Session Persistence Rules

On conversation start:
- Kiro creates a new session note from template
- Kiro updates [[Copilot Output]] with active session link
- Kiro appends session to [[_index]]

On user turn:
- Kiro appends user message to active session note

On Copilot turn:
- Kiro appends Copilot response to active session note
- Copilot updates summary, decisions, action items

On session close:
- Kiro changes session status to `complete`
- Copilot writes final summary
- Kiro updates [[_index]] and [[Copilot Output]]
