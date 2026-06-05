# Architecture Amendment — As-Built vs Original Spec

> This amendment supersedes the original steering doc's architectural descriptions
> wherever they conflict with what was actually built. The original steering doc
> remains as historical context. This document is the source of truth for the
> current system's architecture.

Last updated: 2026-05-19

---

## Section 1 — Hook Status (10 Hooks)

| # | Original Spec Name | As-Built File | Status | Deviations |
|---|-------------------|---------------|--------|------------|
| 1 | prompt-sanitizer | `pipeline/01-prompt-sanitizer.ts` (inline in LLM service) | ✅ Complete | Integrated into LLM streaming, not a standalone hook file |
| 2 | code-generator | `pipeline/02-code-generator.ts` | ✅ Complete | None — matches spec |
| 3 | dependency-validator | `pipeline/03-dependency-validator.ts` | ✅ Complete | npm registry client validates versions; no Expo SDK compat check (deferred) |
| 4 | secret-scanner | `pipeline/04-secret-scanner.ts` | ✅ Complete | None — matches spec |
| 5 | preview-refresher | `pipeline/05-preview-refresher.ts` | ❌ Stub | Concept replaced by build pipeline. No live preview pane exists. |
| 6 | build-preparer | `pipeline/05-build-preparer.ts` | ✅ Complete | Validates app.json, auto-increments build numbers, retrieves Apple creds |
| 7 | build-runner | `pipeline/06-build-runner.ts` | ✅ Complete | EAS CLI subprocess, iOS bootstrap, polling, artifact storage |
| 8 | asset-generator | `pipeline/07-asset-generator.ts` | ✅ Complete | OpenAI gpt-image-1-mini, 4 assets per project |
| 9 | store-listing-writer | `pipeline/08-store-listing-writer.ts` | ❌ Stub | Phase 8 work |
| 10 | submission-prep | `pipeline/09-submission-prep.ts` | ❌ Stub | Phase 8 work |
| — | crash-watcher | `pipeline/10-crash-watcher.ts` | ❌ Stub | Phase 9 work (Sentry webhook) |

---

## Section 2 — Directory Structure (As-Built)

```
packages/app/src/zionx/app-development/
├── api/
│   └── handlers.ts              — HTTP endpoint handlers (/app-dev/*)
├── config/
│   ├── hooks.config.ts          — Kill switches + dryRun per hook
│   ├── limits.ts                — Timeouts, rate limits, budgets
│   └── apple-credentials-config.ts — Apple team/account constants
├── events/
│   ├── event-types.ts           — Event taxonomy (appdev.*)
│   ├── hook-subscribers.ts      — Hooks 3, 4, 7 wired to event bus
│   ├── recent-writes.ts         — Suppresses watcher re-triggers
│   ├── watcher-snapshot.ts      — File system state persistence
│   └── websocket-broadcaster.ts — Dashboard WebSocket events
├── pipeline/
│   ├── 01-prompt-sanitizer.ts   — (inline in LLM service)
│   ├── 02-code-generator.ts     — Claude streaming + file parsing
│   ├── 03-dependency-validator.ts — npm version validation
│   ├── 04-secret-scanner.ts     — Credential leak detection
│   ├── 05-build-preparer.ts     — app.json validation + build number
│   ├── 05-preview-refresher.ts  — STUB (concept replaced)
│   ├── 06-build-runner.ts       — EAS build submission + iOS bootstrap
│   ├── 07-asset-generator.ts    — OpenAI image generation
│   ├── 08-store-listing-writer.ts — STUB
│   ├── 09-submission-prep.ts    — STUB
│   ├── 10-crash-watcher.ts      — STUB
│   ├── asset-prompts.ts         — Prompt templates for 4 asset types
│   └── types.ts                 — HookContext, HookResult, HookMetadata
├── services/
│   ├── llm-service.ts           — Claude SDK wrapper + streaming
│   ├── prompts.ts               — System prompt (SDK 54, file markers)
│   ├── openai-images-client.ts  — OpenAI Images API (gpt-image-1-mini)
│   ├── eas-cli-wrapper.ts       — EAS CLI subprocess management
│   ├── build-status-poller.ts   — Adaptive polling for build completion
│   ├── artifact-storage-client.ts — S3 artifact upload/download
│   ├── npm-registry-client.ts   — npm version lookups
│   └── apple-credentials/       — iOS credential automation
│       ├── asc-jwt.ts           — Apple JWT signing (ES256)
│       ├── asc-client.ts        — App Store Connect API client
│       ├── csr-generator.ts     — RSA keypair + CSR + P12 bundling
│       ├── eas-graphql-client.ts — EAS GraphQL mutations/queries
│       └── bootstrap-flow.ts    — 6-step idempotent orchestrator
├── utils/
│   ├── circuit-breaker.ts       — Per-hook circuit breaker
│   ├── retry.ts                 — Exponential backoff with abort
│   ├── timeout.ts               — Promise timeout wrapper
│   ├── sanitizer.ts             — 8 secret detectors
│   └── temp-credential-file.ts  — Secure temp file write/cleanup
└── workspace/
    └── workspace.ts             — Project file I/O with traversal protection
```

**Rationale**: The monorepo convention places domain logic under `packages/app/src/zionx/`. The `app-development/` subdirectory is a sibling to `studio/`, `gtm/`, `ads/`, `design/` — all ZionX domain modules. This matches the steering doc's "siblings" section.

---

## Section 3 — Hook Architecture (As-Built vs Spec)

### What the spec described
- Event-driven hooks triggered by file system changes
- Each hook as a `.kiro.hook.json` file with debounceMs, maxConcurrent
- Chokidar file watcher dispatching events to hook subscribers
- Hooks fire independently based on file patterns

### What was built
- **Request-driven pipeline** triggered by API calls (`POST /app-dev/generate`, `POST /app-dev/build`)
- Each hook is a TypeScript module with uniform interface: `run(input, ctx) → HookResult<T>`
- Hooks 3, 4, 7 ARE event-driven (wired to `appdev.workspace.file.changed` via `hook-subscribers.ts`)
- Hooks 5, 6 are request-driven (called by API handlers)
- Hook 2 is request-driven (called by the generate endpoint)

### What IS preserved from the spec
| Concept | Implementation |
|---------|---------------|
| Global kill switch | `HOOKS_CONFIG.globalKillSwitch` in `hooks.config.ts` |
| Per-hook enable/disable | `HOOKS_CONFIG.hooks[hookId].enabled` |
| Per-hook dryRun | `HOOKS_CONFIG.hooks[hookId].dryRun` |
| Timeout enforcement | Per-hook in `limits.ts` (e.g., `assetGenerationTimeoutMs: 300_000`) |
| Retry with backoff | `utils/retry.ts` used by LLM service, OpenAI client, npm client |
| Idempotency | Hook 7 skips if assets exist; Hook 6 bootstrap is idempotent |
| Failure modes | Each hook declares `failureMode: 'notify' | 'halt'` in metadata |

### What is NOT preserved
| Spec Concept | Reality |
|-------------|---------|
| `.kiro.hook.json` files | Replaced by TypeScript modules with `HOOK_METADATA` const |
| File-system trigger watching (chokidar) | Only Hooks 3/4/7 use event bus; others are request-driven |
| Per-hook circuit breakers on ALL hooks | Only Hook 6 (build-runner) has a circuit breaker. Gap. |
| debounceMs per hook | Only in `hook-subscribers.ts` for event-driven hooks (500ms) |
| maxConcurrent per hook | Declared in metadata but not enforced by a semaphore. Gap. |

---

## Section 4 — Gaps Against Original Spec

### Critical Gaps (affect correctness or safety)
1. **Per-user cost ceilings** — Spec requires per-user daily budget. We have global `dailyBudgetUsd` in limits.ts but no per-user tracking. All builds/generations share one pool.
2. **Circuit breakers on all hooks** — Only Hook 6 has one. Hooks 2, 3, 4, 7 can fail repeatedly without tripping a breaker.
3. **maxConcurrent enforcement** — Declared in hook metadata but no semaphore enforces it. Two concurrent builds could theoretically run.

### Non-Critical Gaps (deferred by design)
4. **Preview pane / preview-refresher (Hook 5)** — Concept replaced by build pipeline. No live preview exists. The spec's "hot reload preview" was for a React Native dev server; we build production artifacts instead.
5. **TestFlight submission** — Spec Phase 6 says "lands on TestFlight." We produce .ipa but don't submit to TestFlight. Requires `eas submit` integration (Phase 8 scope).
6. **HookStatusPanel component** — Phase 9 UI work. No client app exists yet.
7. **Crash watcher / Sentry** — Hook 10 is a stub. Requires Sentry webhook endpoint + event processing.
8. **Store listing writer** — Hook 8 is a stub. Phase 8 work.
9. **Submission prep** — Hook 9 is a stub. Phase 8 work.
10. **Screenshot generation** — Part of Phase 8. Not in any hook currently.

---

## Section 5 — Revised Phase Map (As-Built)

| Phase | Original Scope | As-Built Status | Notes |
|-------|---------------|-----------------|-------|
| 1 | Foundation | ✅ Complete | Types, config, workspace, utilities, directory structure |
| 2 | API Layer | ✅ Complete | 8 endpoints, event bus, WebSocket, file watcher |
| 3 | LLM Integration | ✅ Complete | Claude streaming, file parser, sanitizer, SSE |
| 4 | Event Bus | ✅ Complete | Hook subscribers, watcher snapshots, WebSocket broadcaster |
| 5 | Validation & Safety | ✅ Complete | Hook 3 (deps), Hook 4 (secrets), retry fix |
| 6 | Build Pipeline | ✅ Complete (Build #10 verified end-to-end via Hook 6 — Phase 6.5 hardening pass included) | Hook 5 (prep), Hook 6 (runner), EAS, iOS bootstrap, .aab + .ipa verified. Hardening pass added .gitignore to prompt, eas project:init, multi-prompt regression tests, full iOS credential automation, Hook 6 integration. |
| 7 | Asset Generation | ✅ Complete | Hook 7, OpenAI images, 4 assets, splash.png fix |
| 8 | Store Listing | ❌ Pending | Hooks 8+9 stubs. Screenshots, metadata, submission. |
| 9 | Observability | ❌ Pending | Hook 10 stub. Metrics, cost tracking, HookStatusPanel. |

---

## Section 6 — Remaining Work to "Done"

### IMMEDIATE (Phase 6 final validation)
- ✅ DONE — End-to-end iOS build via Hook 6 (Build #10, c91cef02, ~$3, ~4 min)
- Phase 6 is COMPLETE.

### PHASE 7 GAPS (~1 day)
- Per-user daily budget enforcement (not just global)
- Cost event logging (per-generation, per-build, queryable)

### PHASE 8 (~4-6 days)
- Hook 8: store-listing-writer (title, subtitle, description, keywords, category)
- Hook 9: submission-prep (checklist, manual gate, confirm-submit)
- Screenshot generation (device frames, multiple sizes)
- TestFlight submission via `eas submit --platform ios`
- Google Play submission via `eas submit --platform android`

### PHASE 9 (~1-2 days)
- Hook 10: crash-watcher (Sentry webhook → event bus → notification)
- Per-hook metrics (invocation count, duration, failure rate)
- Global pipeline health dashboard data
- Verify globalKillSwitch disables everything

### CLIENT INTEGRATION (~1-2 days, post-Phase 9)
- ZionX app screens for the App Development tab
- Chat interface calling /app-dev/* endpoints
- Real-time status streaming via WebSocket
- Build artifact display + download links

### TOTAL REMAINING: ~8-12 days of focused work

---

## Verification Evidence

| Artifact | Date | Proof |
|----------|------|-------|
| Android .aab (Build #8) | 2026-05-19 | 45 MB, magic bytes 50 4B 03 04, clean generation |
| iOS .ipa (Build #9) | 2026-05-19 | 12.36 MB, magic bytes 50 4B 03 04, bootstrap + build (standalone script) |
| iOS .ipa (Build #10, c91cef02) | 2026-05-19 | 12.36 MB, magic bytes 50 4B 03 04, FULL pipeline via Hook 6 (not standalone bootstrap) — Phase 6.5 verified end-to-end |
| Test suite | 2026-05-19 | 408 tests passing, 4 skipped (gated) |
| tsc | 2026-05-19 | 1 known baseline error (autonomous-engine.ts:248) |
| Commits on main | 2026-05-19 | 40+ commits, all pushed to origin |


---

## Amendment v2 — Phase 4 (E2B sandbox) live (2026-06-05)

This amendment supplements the as-built section above. The architectural
changes from "Snack-only preview" to "agent harness + E2B sandbox + auth
proxy" are summarized here.

### What changed at the runtime level

| Layer | Before (v1) | After (v2) |
|---|---|---|
| **Generation** | One-shot `streamGeneration`: Claude emits files between `--- FILE: path ---` markers, server parses and writes | Tool-using agent loop: Claude calls `read_file`/`write_file`/`edit_file`/`run_command`/`spawn_subagent` discrete tools through the Anthropic Tool-Use API |
| **Iteration** | Each prompt regenerates from scratch | Agent reads existing workspace + edits in place |
| **Preview** | Snack `/embedded/<id>` iframe with editor chrome clipped via CSS | Real E2B Linux sandbox running Expo dev server, served through `/api/preview/:projectId/*` auth proxy |
| **Multi-screen** | Snack web bypassed expo-router → multi-screen apps dead-ended | Real sandbox runs the full router → multi-screen navigation works |
| **On-phone** | Generic Snack QR | Auth-proxied URL with HMAC-signed 1-hour token; Expo Go connects to the sandbox's real Metro |
| **Quality gates** | Hooks 11–15 ran post-generation as a separate retry loop in `quality-gate-runner.ts` | Same hooks wrapped as `Subagent` instances; agent loop auto-spawns them when the model goes silent and feeds failures back as the next user prompt |
| **Auth** | `requireHumanOrigin` flag on individual routes | Cognito JWT (existing) + per-project ownership middleware (`requireProjectOwner`) on every `/app-dev/projects/:id/*` route |
| **Sandbox provisioning** | None | `E2BSandboxClient` with per-project cache, lazy provisioning, auto-mkdir of workdir, 5-min idle pause, resume on demand |

### Files map

```
packages/app/src/zionx/app-development/
├── agent/                          NEW (Phase 3)
│   ├── agent-loop.ts               while-not-done loop, prompt caching, reviewer auto-spawn
│   ├── tools/                      10 tool implementations
│   ├── skills/                     8 lazy-loaded markdown playbooks
│   ├── subagents/                  Reviewer wrappers around Hooks 11–15
│   ├── context/                    Workspace summary, compaction, memory, message-builder
│   ├── guardrails/                 command-allowlist, budget caps, secret-scrubber
│   └── evals/                      18 fixed eval tasks + CLI + scorers
├── api/
│   ├── handlers.ts                 Added agentMessage, sandbox status/wake/hibernate
│   ├── routes.ts                   Added /agent-message, /sandbox/*
│   ├── project-ownership.ts        NEW (Phase 5)
│   └── preview-proxy.ts            NEW (Phase 6) — auth-checked stream proxy + signed tokens
├── services/
│   ├── sandbox-client.ts           NEW (Phase 4) — E2BSandboxClient
│   └── snack-client.ts             Deprecated, kept for legacy /generate
└── pipeline/                       Hooks 11–15 unchanged; called via subagent wrappers

packages/dashboard/src/views/
├── harness-studio*.ts              NEW (Phase 10) — 3-column locked-viewport UI
└── studio.ts                       Legacy, still default; ?harness=1 opts in

packages/services/src/shaar/
└── production-server.ts            Loads seraphim/e2b → E2B_API_KEY → E2BSandboxClient → globalThis.__zionxSandboxClient
```

### Fully verified end-to-end (Session 9, 2026-06-05)

`scripts/harness-sandbox-probe.mjs` ran the full chain:
- Resolved `seraphim/anthropic` + `seraphim/e2b` from AWS Secrets Manager
- Provisioned a real E2B sandbox in 444ms
- Agent loop fired `run_command` against the sandbox twice
- Real stdout came back: `4` (from `node -e "console.log(2+2)"`) and `v20.9.0`
- 7.6 seconds end-to-end, ~$0.005 LLM + ~$0.0001 sandbox compute

### What's still v1-style

- `/generate` endpoint (legacy `streamGeneration`) remains for one release for backward compatibility
- Custom `zionx-expo-base` E2B template (Dockerfile + Expo preinstall + iptables egress allowlist) is deferred — `base` template suffices for current verification
