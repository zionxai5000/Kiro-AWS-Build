---
tags: [architecture, services, shaar, api, gateway]
updated: 2025-01-20
---

# Shaar Agent Gateway

> The interface layer between all human interaction channels and the SeraphimOS agent runtime.

## Overview

Shaar (שער — "gate") provides REST API, WebSocket, and multi-channel routing for all human-to-system communication. Every command — whether from dashboard, Telegram, iMessage, voice, or API — passes through Shaar with uniform semantic interpretation.

Package: `packages/services/src/shaar/`

---

## Components

| File | Purpose |
|------|---------|
| `api-routes.ts` | REST API route definitions |
| `websocket-handler.ts` | WebSocket real-time updates |
| `command-router.ts` | Uniform command parsing from any channel |
| `notifications.ts` | Multi-channel notification delivery |
| `local-server.ts` | Local dev HTTP server (port 3000) |
| `production-server.ts` | ECS production server |

---

## REST API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents with status |
| GET | `/api/agents/:id` | Agent detail |
| POST | `/api/agents/:id/execute` | Submit task to agent |
| GET | `/api/pillars` | Pillar metrics |
| GET | `/api/costs` | Cost data from Otzar |
| GET | `/api/audit` | Audit trail query |
| GET | `/api/health` | System health check |
| POST | `/api/commands` | Issue command |

---

## WebSocket Events

Real-time events pushed via `/ws`:
- Agent state changes
- Cost updates
- Alert notifications
- Workflow progress
- Recommendation submissions
- Chat messages
- Delegation status updates
- Presence changes

---

## Authentication

- JWT from Cognito User Pool
- Extracted tenant and role from token
- [[Mishmar Governance Service|Mishmar]] authorization on every request
- Short-lived tokens with refresh rotation
- All auth failures logged to [[XO Audit Service|XO Audit]]

---

## Notification Delivery

Notifications delivered within 60 seconds through preferred channel:
- Dashboard (WebSocket push)
- Telegram (per-agent threads)
- Email (via Gmail driver)
- iMessage (via iMessage driver)

Configurable per user: preferred channel, quiet hours, priority filtering.

## Related

- [[Dashboard Views]]
- [[Seraphim Dashboard]]
- [[Communication Layer]]
- [[Architecture Overview]]
