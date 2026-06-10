# Master Requirements — All Workstreams

This is the single source of truth for what we're building across SeraphimOS.
Tasks are grouped by domain. Detailed status lives in `tasks.md`. Architecture
detail lives in `design.md`. Historical workstream files moved to `archive/`.

## How to read this

- **Seraphim** — system-level infrastructure that every domain inherits
  (steering kit, quality gates, persistence, design tokens, observability).
- **ZionX** — the app-generation pipeline. Agent harness, studio UI,
  E2B preview, generated-app quality bar.
- **Hermes** — the messaging/routing layer between agents (Kiro, Copilot, Hermes)
  and the King.

Each domain has a stable list of requirements. New work appends; completed work
stays as a record. The numbering scheme (e.g., `R2.4.6`) is permanent — please
do not renumber existing requirements.

---

## 1. SERAPHIM (system-wide)

### 1.1 — Quality bar enforcement

- **R1.1.1** — Every generated app must pass 5 gates before "done":
  persistence, onboarding, visual quality, accessibility/performance,
  store readiness.
- **R1.1.2** — A non-bypassable server-side pipeline (Hooks 11–15) must
  grade every generation and re-prompt the agent up to 2× on failure.
- **R1.1.3** — Hooks must score per-screen worst-case (no hiding polish
  in unused files).
- **R1.1.4** — Spec-card check must run BEFORE generation; a 10-key JSON
  contract is required from the agent on its first message.
- **R1.1.5** — Quality score (worst of visual / persistence / domain /
  onboarding) must be persisted to project meta and rendered as a pill in
  the studio sidebar.

### 1.2 — Steering & developer kit

- **R1.2.1** — 5 always-loaded steering files must auto-include in every
  Kiro session: `00-quality-bar`, `10-design-system`, `20-persistence`,
  `30-onboarding`, `40-store-readiness`.
- **R1.2.2** — `.kiro/scripts/verify-app.sh` must run sequentially with
  fail-fast on the first violation (no aggregation).
- **R1.2.3** — `.kiro/scripts/check-no-static-data.mjs` must catch
  hardcoded arrays in shipped screens, allowlisting `src/theme/**` and
  `SEED_*`/`INITIAL_*`/`DEFAULT_*` constants in the data layer.
- **R1.2.4** — Two Kiro IDE hooks must auto-fire: `spec-first-build` on
  prompt submit, `quality-gate-on-stop` on agent stop.
- **R1.2.5** — A frame-diff utility (`.kiro/scripts/frame-diff.ts`) must
  detect stuck/identical screenshots so visual capture never lies.

### 1.3 — Design system enforcement (Midnight Aurora palette)

- **R1.3.1** — Tokens must come from a single source of truth
  (`src/theme/tokens.ts`).
- **R1.3.2** — Banned hex list (`#FF8C00`, `#fff`, `#000`, all grayscale)
  must be enforced by Hook 11 hard-fail rules.
- **R1.3.3** — Required gradient stops must be enforced:
  - Body: 3-stop deep-indigo background as `<LinearGradient style={StyleSheet.absoluteFill}>` first child of root.
  - Hero: 2-stop violet → pink.
  - CTA: 2-stop champagne → rose.
- **R1.3.4** — Token contrast must meet WCAG AA (4.5:1 body, 3:1 large)
  without override.
- **R1.3.5** — Motion: durations 280–480ms; reduced-motion always honored.

### 1.4 — Persistence & observability infrastructure

- **R1.4.1** — Workspace files must survive Fargate task restarts
  (S3 mirror + hydrate at boot).
- **R1.4.2** — Sentry breadcrumbs must flow through a same-origin
  `/api/sentry-tunnel` to defeat mixed-content blocking.
- **R1.4.3** — A spec runner must grade live sessions hourly + on every
  dashboard load, surfacing violations as Sentry issues with source-line
  pointers.
- **R1.4.4** — Wake-state for sandboxes must be coherent across all ECS
  tasks (S3-backed `wake-state/<projectId>.json`, not in-memory per task).
- **R1.4.5** — `/health` endpoint must expose `persistence.durable: true`
  when S3 mirror is wired and hydrate completed at boot.

### 1.5 — Obsidian vault sync (sub-domain of Seraphim)

- **R1.5.1** — Vault writes must go through a single layer
  (`@seraphim/vault-sync`).
- **R1.5.2** — Three sync layers (Git baseline, file watcher, Obsidian
  REST API) must run side-by-side; failure of one must not crash the others.
- **R1.5.3** — Agent-to-agent messages must route through
  `vault/01 - Operations/Agent Comms/` (Inbox, Outbox, Task Queue,
  Decision Log) per the Copilot Protocol.
- **R1.5.4** — `OBSIDIAN_API_TOKEN` must come from AWS Secrets Manager
  (`seraphim/obsidian`), never committed.
- **R1.5.5** — Copilot session memory: every Copilot conversation must
  auto-persist to `01 - Operations/Copilot Sessions/` as a per-session note.

---

## 2. ZIONX (App Development)

### 2.1 — Agent harness (tool-using Claude loop)

- **R2.1.1** — Replace one-shot `streamGeneration` with a discrete-tool
  agent (`read_file`, `write_file`, `edit_file`, `run_command`,
  `spawn_subagent`, `screenshot`, `fetch_url`, `load_skill`, `search`,
  `list_files`).
- **R2.1.2** — 8 lazy-loaded skill markdown files: `frontend-app-design`,
  `zustand-persistence`, `expo-router-app`, `ai-apis-claude`,
  `upload-assets`, `appstore-preflight`, `security-review`, `code-review`.
- **R2.1.3** — Reviewer subagents wrap Hooks 11–15 and auto-spawn when
  the model goes silent; failures feed back as the next user prompt with
  up to 2 retries.
- **R2.1.4** — Prompt caching ON from day 1; static system prompt + skills
  are the cacheable block.
- **R2.1.5** — Per-project ownership middleware on every
  `/app-dev/projects/:id/*` route. Lazy-claim migration writes `ownerId`
  on first authenticated access for legacy projects.
- **R2.1.6** — Command allowlist gates `run_command` (npm, npx, expo,
  eas, tsc, eslint, prettier, jest, vitest, git read-only). Shell
  metacharacters blocked.
- **R2.1.7** — Secret scrubber strips Anthropic / OpenAI / GitHub / AWS /
  GCP / Slack / Stripe / JWT patterns from tool inputs and outputs.
- **R2.1.8** — Budget guardrails cap tokens, iterations, and cost per run.

### 2.2 — Generated-app quality

- **R2.2.1** — Every generated `App.tsx` must include the AGENT BUILD
  PROTOCOL comment block (10 steps in order: domain anchor, primary user
  goal, screen inventory, state model, first-launch seed, persistence
  gate, visual anchor, hero interaction, empty state, fail check).
- **R2.2.2** — Smart project naming derives a 2–4 word title from the
  prompt (no raw-prompt-as-title).
- **R2.2.3** — Golden starter template seeds every new project with theme
  tokens, zustand persist store, onboarding flow, and a designed empty
  state.
- **R2.2.4** — Bundler overlays the canonical `package.json`, `app.json`,
  `babel.config.js`, `metro.config.js`, `tsconfig.json` on every build.
  Sanitizes invalid `app.json` plugins (e.g., `expo-haptics` is a runtime
  lib, not a config plugin).
- **R2.2.5** — Dependency validator gates the bundle on hallucinated
  packages (e.g., `@motify/components`).
- **R2.2.6** — `dist/index.html` must be patched to `<script type="module">`
  so Expo SDK 54's `import.meta` works in the browser.
- **R2.2.7** — Every generated app must have a Projects tab that lists
  completed apps with name, screenshot, and View/Edit actions.

### 2.3 — Studio UI (3-column harness studio)

- **R2.3.1** — Locked-viewport 220 / 380 / 1fr layout
  (sidebar / chat / preview). Studio must not exceed
  `calc(100vh - 80px)` ever.
- **R2.3.2** — Glass + depth aesthetic: backdrop blur, hairline borders,
  soft shadows, subtle vertical gradient.
- **R2.3.3** — Empty state hero + 4 example chips that fill the input
  ("Habit tracker", "Todo list", "Recipe manager", "Workout log").
- **R2.3.4** — Plan card collapsible above narration; tool-action chips
  inline with ✎/⚙/⚡/✦ glyphs.
- **R2.3.5** — Quality score pill in sidebar per project; spec card
  bubble in chat showing the 10 keys.
- **R2.3.6** — QR modal opens the auth-proxy signed-token URL for on-phone
  preview.
- **R2.3.7** — `?harness=1` query param opts in to the new harness studio
  alongside the legacy `studio.ts` (one-line route swap when ready).

### 2.4 — Preview pipeline (E2B sandbox)

- **R2.4.1** — `E2BSandboxClient` provisions per-project sandboxes lazily;
  resumes paused; recreates on 24h timeout. Default lifetime 20 minutes
  with `extendTimeout()` mid-bundle.
- **R2.4.2** — Server-side bundling: stage workspace, `npm install
  --legacy-peer-deps --ignore-scripts`, `npx expo export --platform web`,
  push static `dist/` to sandbox, run `python3 -m http.server 8081`.
- **R2.4.3** — Static server must survive runCommand session close
  (supervised launch + setsid + disown + restart-on-exit loop).
- **R2.4.4** — Auth proxy `/api/preview/:projectId/*` rejects anonymous;
  accepts Cognito session OR signed query token (1-hour TTL, HMAC-SHA256).
  E2B URL is never exposed to the browser.
- **R2.4.5** — Wake state persisted to S3 (`wake-state/<projectId>.json`)
  so all ECS tasks see the same status. Persists are serialized with a
  delayed final write to defeat out-of-order races.
- **R2.4.6** — Status check verifies cached publicUrl is reachable; treats
  stale URLs as `idle` so the dashboard re-wakes.
- **R2.4.7** — Async wake: `POST /sandbox/wake` returns 202 immediately;
  dashboard polls `GET /sandbox` every 5s until `live` or `error`. ALB
  60s idle timeout never seen.
- **R2.4.8** — Workspace reads fall back to S3 when local disk misses
  (multi-task safe).
- **R2.4.9** — Preview proxy resolves the sandbox URL from the wake-state
  store first (cross-task coherent), only falling through to the local
  E2BSandboxClient cache when the store has no record.

### 2.5 — Acceptance tests

- **R2.5.1** — Tic-tac-toe: 10-step Playwright acceptance must pass
  against the live dashboard preview (King taps a square → X/O appears).
- **R2.5.2** — Habit tracker: 10-step Playwright acceptance must pass;
  persistence round-trip after refresh required (added habit must
  survive).
- **R2.5.3** — Eval suite: 18 fixed tasks (8 domain builds + 3 iterations
  + 2 fixes + 5 edge cases) gates prompt/skill/tool changes via the
  GitHub Action `eval-suite.yml`.

### 2.6 — Studio spec compliance loop

- **R2.6.1** — 16 Sentry rules grade every live Studio session
  (send-creates-or-streams, build-clicks-must-respond, etc.).
- **R2.6.2** — Hourly cron + boot-time evaluator surface violations as
  Sentry issues.
- **R2.6.3** — Every "no follow-up breadcrumb within window" violation
  must point at the responsible code path (file:line).
- **R2.6.4** — Spec rules live in `docs/zionx-studio-spec.md` and stay in
  sync with `services/spec-runner.ts`.

### 2.7 — Decommission of legacy paths

- **R2.7.1** — `POST /app-dev/projects/:id/generate` (legacy one-shot)
  emits `Deprecation`/`Sunset`/`Link` headers per RFC 8594.
- **R2.7.2** — Sunset date: 2026-09-01. Removal happens after that.
- **R2.7.3** — Snack-based preview path is deprecated and only kept for
  the legacy `studio.ts` UI.

---

## 3. HERMES (messaging & routing)

### 3.1 — Agent message router

- **R3.1.1** — Hermes watches `vault/01 - Operations/Agent Comms/Inbox.md`
  for new messages with `status: open`.
- **R3.1.2** — Routes messages to the addressed agent (Kiro, Copilot,
  ZionX, etc.); marks delivered messages as `acknowledged`.
- **R3.1.3** — Records responses in `Outbox.md`; escalates urgent or
  blocked items to Copilot or the King.
- **R3.1.4** — Every message validated against the Copilot Protocol
  schema (id, from, to, type, priority, status). Malformed messages
  rejected with a structured note.

### 3.2 — Notification & escalation

- **R3.2.1** — Hermes receives status events from Kiro
  (task completed/failed) and routes them to the right destination
  (King email, Sentry alert, vault note).
- **R3.2.2** — Implements deferred/scheduled message delivery for King's
  end-of-day summary.
- **R3.2.3** — Surface critical alerts (build failed, sandbox down) as
  Sentry issues so existing alert rules pick them up.

### 3.3 — Cross-agent contract enforcement

- **R3.3.1** — Validates every inter-agent message against the schema
  before routing.
- **R3.3.2** — Tracks open tasks (`status: open`) and follows up on
  overdue items per priority.
- **R3.3.3** — Records all routing decisions in
  `vault/01 - Operations/Agent Comms/Decision Log.md` for audit.

---

## Conventions

- Numbering is permanent: never renumber existing requirements when
  inserting new ones; use the next available sub-number.
- Each requirement is a single testable statement.
- "Must" is a hard requirement; "should" is a strong default with
  documented exceptions allowed.
- Status of each requirement (in-progress / shipped / blocked) lives in
  `tasks.md`, not here.
