# Master Design — All Workstreams

How the system is built. Reads in parallel with `requirements.md` (what)
and `tasks.md` (status). Detailed historical design notes per workstream
live in `archive/`.

---

## 1. SERAPHIM

### 1.1 — Quality gates pipeline (Hooks 11–15)

```
generate request
    │
    ▼
Hook 14: Spec Card  ──► validates 10-key JSON contract on first message
    │ (pass)
    ▼
Hook 2: Code Generator  ──► Claude streams files via discrete tools
    │
    ▼
Hooks 11/12/13/15 in parallel  ──► visual / persistence / domain / onboarding
    │
    ├── all pass ──► persist score, emit appdev.quality.gate.passed
    │
    └── any fail ──► retry with directive prepended to prompt
                     (max 2 retries)  ──► after 2 fails, ship with
                                          qualityBarFailed: true badge
```

| Hook | File | What it scores |
|---|---|---|
| 11 — Visual Polish | `pipeline/11-visual-polish-validator.ts` | 12 checks/screen, worst-of-N |
| 12 — Persistence | `pipeline/12-persistence-auditor.ts` | 4 hard rules (zustand persist + AsyncStorage + named key + no static arrays) |
| 13 — Domain Fitness | `pipeline/13-domain-fitness-auditor.ts` | Per-domain checklist (habit/todo/recipe/workout/game/journal/generic) |
| 14 — Spec Card | `pipeline/14-spec-card.ts` | 10 keys present + non-empty |
| 15 — Onboarding | `pipeline/15-onboarding-auditor.ts` | OnboardingFlow exists, routed on first launch, persists flag, skippable |

Orchestrator: `pipeline/quality-gate-runner.ts` runs all checks in
parallel, builds `RetryDirective` from failures, re-prompts the LLM, and
publishes `appdev.quality.gate.passed` / `appdev.quality.gate.failed`
events.

### 1.2 — Steering kit & developer hooks

5 always-loaded files in `.kiro/steering/`:

```
00-quality-bar.md      — the 5 gates + AWS Secrets Manager rule + build order
10-design-system.md    — Midnight Aurora palette, type scale, spacing, motion
20-persistence.md      — zustand persist + AsyncStorage, no-static-data scanner
30-onboarding.md       — first-run walkthrough requirement
40-store-readiness.md  — accessibility, performance, store assets
```

Two Kiro IDE hooks in `.kiro/hooks/`:

```
spec-first-build.kiro.hook         — on prompt submit, asks for spec doc first
quality-gate-on-stop.kiro.hook     — on agent stop, runs verify-app.sh
```

Scripts in `.kiro/scripts/`:

```
verify-app.sh              — sequential blocking gate; mode auto-detection
check-no-static-data.mjs   — scans for hardcoded arrays in screens
frame-diff.ts              — pixel comparison so visual capture never lies
```

### 1.3 — Design tokens

Single source: `templates/golden-starter/src/theme/tokens.ts` (Midnight
Aurora palette). Hex values are bound by Hook 11 hard-fail rules; banned
list includes generic grayscale and `#FF8C00`.

Required gradients:

| Surface | Stops | Direction |
|---|---|---|
| Body bg | `#0A0E1F` → `#14182E` → `#1B1F3A` | top → bottom |
| Hero card | `#A78BFA` → `#E0AAFF` | violet → pink |
| CTA | `#F5C97B` → `#FF7B9C` | champagne → rose |
| Streak chip | `#4FD1C5` → `#A78BFA` | teal → violet |

### 1.4 — Persistence & observability

```
ECS task (Fargate)
  │
  ├── Workspace (in-memory) ──► fs ops local
  │       │
  │       └── S3WorkspaceStore (write-through mirror)
  │             │
  │             └── s3://<artifacts>/workspaces/<projectId>/...
  │
  ├── WakeStateStore ──► s3://<artifacts>/wake-state/<projectId>.json
  │     (cross-task coherent — read on every status check)
  │
  └── Sentry tunnel: POST /api/sentry-tunnel
        │
        └── Sentry breadcrumbs flow through same-origin proxy
              (defeats mixed-content blocking)
```

At boot, `S3WorkspaceStore.hydrateAll()` restores every project to local
disk before the file watcher starts. After that, local FS is the source
of truth and S3 is durable backup only.

Spec runner runs hourly (`production-server.ts` cron) + on every
dashboard mount. Reads recent Sentry breadcrumbs, applies 16 rules from
`services/spec-runner.ts`, emits violations as Sentry issues.

### 1.5 — Obsidian vault sync architecture

```
@seraphim/vault-sync
  │
  ├── Layer 1: GitSync           — auto-commit + push, durable baseline
  ├── Layer 2: VaultWatcher      — chokidar file events → publisher
  └── Layer 3: ObsidianApiDriver — Local REST API at https://127.0.0.1:27124
```

All three layers run side-by-side; failure of one logs but does not
crash the others. Token resolved from `seraphim/obsidian` secret.

Agent comms protocol: messages flow through
`vault/01 - Operations/Agent Comms/Inbox.md` → `Outbox.md` →
`Decision Log.md`. Schema: `id`, `from`, `to`, `type`, `priority`,
`status` (open / acknowledged / in-progress / done).

---

## 2. ZIONX (App Development)

### 2.1 — Agent harness architecture

```
POST /app-dev/projects/:id/agent-message  (SSE)
   │
   ▼
agentLoop({ projectId, prompt, workspace, sandbox, anthropic })
   │
   ├── system prompt + lazy skills index   (cached block, prompt caching ON)
   ├── workspace summary + memory + history
   │
   ├── tool registry:
   │     read_file  write_file  edit_file  search  list_files
   │     load_skill run_command screenshot fetch_url spawn_subagent
   │
   ├── while not done:
   │     Claude call (streaming) → tool calls or text
   │     execute tool → push result → loop
   │
   ├── when model goes silent:
   │     auto-spawn 5 reviewer subagents (Hooks 11–15 wrapped)
   │     if any fails → feed back as next user prompt (max 2 retries)
   │
   └── return AgentRunResult { passed, reviewers, tokens, files, ... }
```

Files map:

```
packages/app/src/zionx/app-development/
├── agent/
│   ├── agent-loop.ts          — the while-not-done loop
│   ├── system-prompt.ts       — short prompt + lazy skills index
│   ├── types.ts               — Anthropic-shape AgentMessage / Tool / etc.
│   ├── tools/                 — 10 tool implementations
│   ├── skills/                — 8 lazy markdown packets
│   ├── subagents/             — Hook-11–15 wrappers
│   ├── context/               — workspace summary, compaction, memory, builder
│   ├── guardrails/            — command allowlist, budget, secret scrubber
│   └── evals/                 — 18 fixed tasks + scorers + runner
├── api/
│   ├── handlers.ts            — agentMessage, sandbox/wake/hibernate, etc.
│   ├── project-ownership.ts   — requireProjectOwnerFromParams
│   └── preview-proxy.ts       — /api/preview/:projectId/* with HMAC tokens
├── pipeline/                  — Hooks 11–15 (request-driven)
├── services/
│   ├── llm-service.ts         — legacy streamGeneration (deprecated)
│   ├── sandbox-client.ts      — E2BSandboxClient
│   ├── server-bundler.ts      — bundleAndServe
│   ├── wake-state-store.ts    — S3-backed cross-task wake state
│   └── s3-workspace-store.ts  — durable workspace mirror
└── workspace/
    └── workspace.ts           — file I/O with S3 fallback on read
```

### 2.2 — Generated-app contract

Every generated `App.tsx` starts with the AGENT BUILD PROTOCOL block:

```
[1] Domain anchor:        e.g., "daily habit tracker for ..."
[2] Primary goal:         e.g., "tap habit card, watch streak update"
[3] Screen inventory:     Today / History / Settings / Detail
[4] State model:          Habit { id, name, emoji, color, completions[] }
[5] First-launch seed:    4 realistic items (NO Lorem Ipsum)
[6] Persistence gate:     zustand persist → AsyncStorage
[7] Visual anchor:        accent + gradient + motif
[8] Hero interaction:     the one tap-to-delight moment
[9] Empty state:          designed, not blank
[10] Fail check:          the gate that proves it's not stubbed
```

The block is the agent's checklist AND the user's read-me. Bound by
SECTION -1 of `services/prompts.ts`.

### 2.3 — Studio UI (3-column harness)

```
┌──────────────────────────────────────────────────────────────┐
│ Top nav (56px) — ZIONX | Studio Projects Design | + New App  │
├──────────┬─────────────────────┬─────────────────────────────┤
│ Sidebar  │  Chat               │  Preview                    │
│ (220px)  │  (380px)            │  (1fr)                      │
│          │                     │                             │
│ Projects │  Plan card          │  ┌── 🌐 iOS Android ──┐     │
│ list     │  (collapsible)      │  │                    │     │
│          │                     │  │   E2B preview      │     │
│ + New    │  Narration          │  │   (auth-proxied)   │     │
│ App      │  Tool chips         │  │                    │     │
│          │                     │  └────────────────────┘     │
│ Quality  │  Reviewer scores    │  ↻ Refresh   ⛶ Fullscreen   │
│ pills    │  ─────              │  📲 Phone (QR modal)        │
│          │  Input + Send       │  Status: live • 06:14 UTC   │
└──────────┴─────────────────────┴─────────────────────────────┘
```

Locked viewport: studio shell `height: calc(100vh - 80px) !important`.
Each column scrolls internally. Glass + depth via `backdrop-filter` and
hairline borders.

Files: `packages/dashboard/src/views/harness-studio.ts` +
`harness-studio-controller.ts` + `harness-studio-tokens.ts`. Mounted
behind `?harness=1` query param.

### 2.4 — Preview pipeline architecture

```
Click project in sidebar
    │
    ▼
POST /app-dev/projects/:id/sandbox/wake (returns 202 instantly)
    │
    ├──► WakeStateStore.write({ state: 'building', ... }) → S3
    │
    └──► async background:
         server-bundler.bundleAndServe()
            │
            ├── stage workspace files into /tmp/zionx-bundle-<id>/
            ├── overlay golden-starter package.json + app.json
            ├── npm install --legacy-peer-deps --ignore-scripts
            ├── npx expo export --platform web → dist/
            ├── patch dist/index.html → script type="module"
            ├── upload dist/ files to E2B sandbox via writeBinaryFile
            ├── start /tmp/serve-supervisor.sh (loops python http.server 8081)
            ├── verify localhost:8081 responds 2xx (10× retry)
            └── WakeStateStore.write({ state: 'ready', publicUrl, ... })

Dashboard polls GET /sandbox every 5s
    │
    ├── reads S3 first (cross-task coherent)
    ├── verifies cached publicUrl reachable
    └── returns live | building | error | idle

Iframe loads /api/preview/:projectId
    │
    ├── auth check (Cognito session OR signed token)
    ├── ownership check
    ├── resolveSandboxUrl (wake-state store first, then E2BSandboxClient)
    └── proxy fetch to upstream sandbox URL
```

Files:
- `services/sandbox-client.ts` — `E2BSandboxClient`
- `services/server-bundler.ts` — `bundleAndServe`
- `services/wake-state-store.ts` — S3 store + reachability check
- `api/preview-proxy.ts` — auth proxy with HMAC tokens
- `api/handlers.ts` — `wakeSandbox`, `getSandboxStatus`, `hibernateSandbox`

### 2.5 — Acceptance test architecture

```
scripts/section-6-acceptance.ts        — 10-step tic-tac-toe
scripts/section-7-habit-tracker.ts     — 10-step habit tracker
scripts/probe-wake-existing.mjs        — wake a saved project
scripts/probe-sandbox-poll.mjs         — poll /sandbox until live
scripts/probe-bundle-render.mjs        — Playwright at sandbox URL
scripts/probe-preview-proxy.mjs        — Playwright at auth-proxied URL
scripts/local-bundle-from-s3.mjs       — local repro of the bundler
agent/evals/                           — 18 fixed evals + GitHub Action
```

Acceptance scripts inject a fake JWT to bypass Cognito (matches the
`playwright-observer` pattern in Shaar Guardian) and assert against the
live dashboard at the production ALB.

### 2.6 — Spec compliance loop

```
Studio dashboard mount
    │
    ├── breadcrumb: studio.session.start
    │
    ├── every interaction → studio.<verb> breadcrumb
    │       (send, build, deploy, openFile, fileSaved, tabClick, ...)
    │
    └── flushSessionTrace every 60s → Sentry.captureMessage
          (so breadcrumbs reach Sentry's storage as event metadata)

Hourly cron + boot-time evaluator:
    │
    ├── Sentry REST API → recent breadcrumbs
    ├── apply 16 rules from spec-runner.ts
    └── emit each violation as a Sentry captured error
        (existing alert rules notify King via email)
```

Rules table lives in `docs/zionx-studio-spec.md`. Adding a rule
requires editing that file AND adding the regex to
`services/spec-runner.ts`.

---

## 3. HERMES (messaging & routing)

### 3.1 — Router design

```
vault/01 - Operations/Agent Comms/
    │
    ├── Inbox.md           — new messages (status: open)
    ├── Outbox.md          — Hermes-routed responses
    ├── Task Queue.md      — actionable work tracked
    └── Decision Log.md    — audit trail

Hermes process:
    │
    ├── watch Inbox.md (file watcher via @seraphim/vault-sync Layer 2)
    ├── parse Markdown messages, validate against schema
    ├── route to addressee (Kiro → write to .kiro/agent-tasks/, etc.)
    ├── update message status: open → acknowledged → in-progress → done
    └── log decision in Decision Log.md
```

Schema (Copilot Protocol):

```json
{
  "id": "2026-MM-DD-HHMM-<slug>",
  "from": "Copilot|Kiro|Hermes|ZionX|...",
  "to":   "Copilot|Kiro|Hermes|ZionX|...",
  "type": "directive|question|status|escalation",
  "priority": "low|medium|high|urgent",
  "status": "open|acknowledged|in-progress|done|blocked",
  "message": "...",
  "requested_action": "...",
  "response_required": true,
  "created_at": "ISO timestamp",
  "related": ["..."]
}
```

### 3.2 — Notification & escalation

Hermes subscribes to:
- Kiro task completion events (file system: `.kiro/agent-tasks/completed/`)
- Sentry alert webhooks (forwarded from existing alert rules)
- Build pipeline events (`appdev.build.failed`, `appdev.quality.gate.failed`)

For each event type, Hermes consults a routing table:

| Event | Default destination | Escalation if unacked |
|---|---|---|
| Task completed | King's vault `Inbox.md` | none |
| Task failed | Copilot for triage | King after 4h |
| Build failed | Sentry issue + King email | King after 1h |
| Sandbox down | Sentry issue + King email | King after 30m |
| Critical security alert | King email immediately | — |

### 3.3 — Cross-agent contract enforcement

Hermes validates every message before routing. Malformed messages get a
structured rejection note appended to `Outbox.md`:

```markdown
## Routing Error: <message-id>

The message at `Inbox.md#<line>` failed validation:
- field: <which>
- reason: <why>
- expected: <schema>

Original message preserved at `archive/inbox/<message-id>.md` for
inspection.
```

---

## Cross-cutting concerns

### Secrets

All credentials resolve from AWS Secrets Manager under `seraphim/<service>`:

```
seraphim/anthropic         — Claude API key
seraphim/openai            — OpenAI API key
seraphim/e2b               — E2B sandbox API key
seraphim/expo              — Expo CLI token
seraphim/appstoreconnect   — App Store Connect API key + key ID
seraphim/githubtoken       — GitHub API token
seraphim/googleplay        — Google Play service account
seraphim/obsidian          — Obsidian Local REST API token
seraphim/sentry            — Sentry org / project / auth-token
```

Resolution: `LocalCredentialManager` (server) reads at boot;
`scripts/*.mjs` use AWS CLI directly. Never committed; never in `.env`.

### Deploy pipeline

```
push to main
    │
    ├── GitHub Actions: deploy.yml
    │     ├── build packages
    │     ├── docker build + push to ECR
    │     ├── ECS update-service (rolling)
    │     └── S3 sync dashboard bundle
    │
    └── ECS rolls 2 tasks (~3 min total)
          ├── task A drains
          ├── task B drains
          ├── task A new replaces (boot ~90s for S3 hydrate)
          └── task B new replaces

ALB 60s idle timeout — every long operation must be async or it 504s.
```

### Test strategy

- Unit tests at the module level (`__tests__/<module>.test.ts`)
- Integration tests via `scripts/probe-*.mjs` against live ALB
- Acceptance tests via Playwright (`scripts/section-*.ts`)
- Eval suite (18 fixed tasks) gates prompt/skill/tool changes via CI
- Verify-app.sh runs locally + as Kiro Agent Stop hook
