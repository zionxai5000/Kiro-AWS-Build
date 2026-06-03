---
tags: [architecture, services, communication, chat, telegram, notifications]
updated: 2025-01-20
---

# Communication Layer

> Unified multi-user, multi-channel communication system connecting humans to SeraphimOS agents.

## Overview

The Communication Layer provides persistent chat with every agent, cross-agent context sharing, priority-based message processing, Telegram integration with dashboard sync, and multi-channel notification routing. Every message is auditable via [[XO Audit Service|XO Audit]].

Package: `packages/services/src/communication/`

---

## Components

| File | Purpose |
|------|---------|
| `service.ts` | Core chat — send, history, search, multi-user |
| `priority-queue.ts` | Priority-based message processing |
| `context-sharing.ts` | Cross-agent context propagation |
| `presence.ts` | Real-time agent presence tracking |
| `telegram.ts` | Telegram Bot integration |
| `sync.ts` | Dashboard ↔ Telegram synchronization |
| `notification-router.ts` | Multi-channel notification delivery |
| `delegation-visibility.ts` | Agent-to-agent delegation tracking |

---

## Agent Communication Service

```typescript
interface AgentCommunicationService {
  sendMessage(userId, agentId, content, priority): Promise<Message>
  getHistory(agentId, filters): Promise<Message[]>
  searchHistory(agentId, query): Promise<Message[]>
  getUnifiedHistory(agentId): Promise<Message[]>  // all users
  getActiveUsers(agentId): Promise<User[]>
}
```

- Persistent storage in `chat_messages` table
- Multi-user context management (separate contexts per user)
- Unified history for agent to see all conversations

---

## Priority Queue

| Priority | Behavior |
|----------|----------|
| Critical | Interrupts non-critical agent work within 10 seconds |
| High | King messages auto-elevated to high |
| Normal | Default priority, FIFO processing |
| Low | Processed after all higher-priority messages |

Rate limiting and fairness for multi-user access.

---

## Context Sharing Engine

Automatic cross-agent context propagation:
- **Relevance analysis:** embedding similarity (threshold 0.7) determines if message is relevant to other agents
- **Auto-propagation:** relevant context shared to target agents' working memory
- **@-mention parsing:** explicit `@agent_name` routes context directly
- **Handoff summaries:** when user switches agents, generates concise summary for new agent
- Configurable handoff mode: automatic, on-request, or manual

---

## Agent Presence

Real-time presence states broadcasted via WebSocket within 2 seconds:
- `idle` — no active work
- `working` — with task description
- `waiting_input` — needs user response
- `thinking` — processing
- `parallel_processing` — with concurrent task count
- `degraded` — reduced capability

---

## Telegram Integration

- Per-agent threads in a Telegram group
- Account linking (Telegram user → SeraphimOS account)
- Bidirectional sync with dashboard (< 3 second latency)
- Messages show source indicator ("via Telegram" / "via Dashboard")
- [[Mishmar Governance Service|Mishmar]] authorization enforcement

---

## Notification Routing

```typescript
interface NotificationRoutingEngine {
  setRules(userId, rules: NotificationRule[]): Promise<void>
  route(notification: Notification): Promise<DeliveryResult[]>
  checkEscalation(): Promise<void>  // background job
  acknowledge(notificationId: string): Promise<void>
}
```

Escalation timeouts:
- Critical: 5 minutes
- High: 15 minutes

Delivery channels: Dashboard (WebSocket), Telegram, Email (Gmail), iMessage

---

## Delegation Visibility

When an agent delegates to another agent during message processing:
- Delegation chain tracked with status
- Real-time status: pending → in-progress → complete → failed
- Parallel delegation shows all streams with progress
- Visible in both dashboard and Telegram

---

## Communication Audit

All human-agent communications logged to XO Audit:
- User identity, agent identity, message content
- Timestamp, response time, actions triggered
- Conversation replay for any time period
- Pattern analysis: response times, volumes, priority distribution

## Related

- [[Shaar Agent Gateway]]
- [[Dashboard Views]]
- [[Docker Agents]]
- [[XO Audit Service]]
- [[Mishmar Governance Service]]
