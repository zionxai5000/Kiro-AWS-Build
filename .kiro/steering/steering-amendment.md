# Steering Doc Amendment v2 — Backend Orchestration

This amendment supersedes any React Native, Expo, Zustand, MMKV, or mobile-runtime references in the original steering doc.

## Architecture

We are building a backend orchestration pipeline inside `packages/app/src/zionx/app-development/` — pure Node.js TypeScript, ES2022, Node16 modules.

## Location

`packages/app/src/zionx/app-development/`

## Siblings

`studio/`, `gtm/`, `ads/`, `design/` — this is ZionX domain logic, not system infrastructure.

## NO

React Native, Zustand, MMKV, Expo, browser APIs, UI components, mobile runtime dependencies.

## YES

Pure TypeScript modules, file system operations under a workspace abstraction, event bus integration, API endpoints via shaar, Claude API for code generation, child_process for sandboxed execution.

## Hook Implementation

The 10 hooks remain in intent; their implementation is backend pipeline stages, not React hooks or Kiro IDE hooks. They run as TypeScript modules triggered by:

- **API requests** (manual hooks: build-preparer, store-listing, submission-prep)
- **File system events via event-bus** (sanitizer, generator, validator, secret-scanner, preview-refresher, asset-generator)
- **External webhooks** (crash-watcher via Sentry)

## Phases

The 9 phases from the original spec are renamed per the backend orchestration revision in the conversation. Refer to that for current phase definitions.

## Unchanged Rules

All original hard constraints, idempotency rules, kill switches, dry-run-first policy, panic phrase, and phase discipline still apply unchanged.

## Precedence

The original `steering.md` is preserved as historical context. This amendment takes precedence wherever the two conflict.

## Session Start Protocol

On every future session, the first task is to read both `steering.md` AND this `steering-amendment.md`, with this amendment taking precedence.


---

## Amendment v3 — Agent Harness + E2B Sandbox (2026-06-05)

This amendment supplements (does NOT supersede) v2's backend orchestration
description. The implementation now uses a tool-using Claude agent loop
running against per-project E2B Linux sandboxes. The original 10-hook
intent is preserved; reviewer subagents wrap Hooks 11–15.

### Implementation surface

| Concept | Lives at |
|---|---|
| Tool-use agent loop | `packages/app/src/zionx/app-development/agent/` |
| Sandbox client (E2B) | `packages/app/src/zionx/app-development/services/sandbox-client.ts` |
| Reviewer subagents (wrap Hooks 11–15) | `agent/subagents/` |
| Lazy-loaded skills (8) | `agent/skills/*.md` |
| Eval suite | `agent/evals/` (CLI: `pnpm --filter @seraphim/app test:evals`) |
| Studio UI (3-column) | `packages/dashboard/src/views/harness-studio*.ts` |
| Preview auth proxy | `packages/app/src/zionx/app-development/api/preview-proxy.ts` |
| Project ownership middleware | `packages/app/src/zionx/app-development/api/project-ownership.ts` |
| Sandbox lifecycle endpoints | `GET/POST /app-dev/projects/:id/sandbox[/wake|/hibernate]` |

### Endpoints

```
POST /app-dev/projects                                  create project (auto-stamps ownerId)
POST /app-dev/projects/:id/agent-message                tool-loop agent (replaces /generate)
POST /app-dev/projects/:id/generate                     legacy one-shot stream (deprecated, kept for compat)
GET  /app-dev/projects/:id/sandbox                      sandbox status
POST /app-dev/projects/:id/sandbox/wake                 boot sandbox eagerly
POST /app-dev/projects/:id/sandbox/hibernate            pause/dispose sandbox
*    /api/preview/:projectId/*                          auth-proxied preview (E2B URL never exposed)
POST /api/preview/:projectId/token                      issue 1-hour signed token for Expo Go
```

### Secrets

- `seraphim/anthropic` — Claude API key (existing)
- `seraphim/openai` — OpenAI key (existing)
- `seraphim/e2b` — E2B sandbox API key. JSON shape `{"apiKey":"e2b_..."}`. Loaded into `process.env.E2B_API_KEY` at server boot.

### Decommission of v2 paths

- Snack-based preview path is **deprecated**. Marked in `services/snack-client.ts`. Removal plan in `docs/zionx-agent-harness/DECOMMISSION-LEGACY.md`.
- Legacy `streamGeneration` is kept for one release alongside the harness, then removed (Phase 12).
