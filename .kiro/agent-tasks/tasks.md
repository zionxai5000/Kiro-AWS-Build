# Master Task Tracker — All Workstreams

The single place to see what's done, what's in flight, and what's next.
Grouped by domain. Boxes use the binding directive convention:

- ✅ — done and verified
- 🔄 — in progress (current focus)
- ⏱ — **attempted but interrupted** (timeout, deploy fail, context cutoff,
  king tap-out — needs resume from where it stopped)
- ⬜ — open / queued (not yet attempted)
- ⏸ — paused / blocked (waiting on external dependency)
- 🔁 — superseded (replaced by a newer task)
- ❌ — abandoned / cancelled

When a row is `⏱`, the next column should say WHERE it stopped so the
next session can pick it up without re-discovering. Format:
`⏱ stopped at: <last completed step>; resume by: <next action>`.

Numbering matches `requirements.md` so you can trace any task to its
underlying requirement. Detailed history per workstream lives in
`archive/`.

---

## 🎯 Active Work Groups

This is what's in flight **right now**, grouped by goal. Items tick off
in real time. **When the whole group closes, its items are mirrored as
✅ in the domain sections below**, then the group moves to "Closed work
groups" at the bottom.

**Protocol:**
- Every new request opens a new group at the top.
- Every task gets a checkbox here AND in its matching domain row.
- Both check off together when the work lands.
- A group is "closed" when all its rows are ✅ AND the underlying domain
  rows are also ✅.

### G1 — Fix dashboard preview iframe (sandbox doesn't render in studio)

- **Started:** 2026-06-10
- **Goal:** King clicks a project in the dashboard → iframe shows the
  running game (today: blank screen / 404 / closed-port).
- **Maps to domain rows:** ZionX 2.4.12, 2.4.13, 2.4.14, 2.4.15

| ✅/⬜ | Item | Notes |
|---|---|---|
| ✅ | Diagnose 404 from auth proxy | Root cause: `matchPath` does not handle `*` wildcards |
| ✅ | Fix `matchPath` to handle `*` (single + trailing rest segments) | `services/api-routes.ts` |
| ✅ | Inject `<base href="/api/preview/<id>/">` into proxied index.html so asset URLs route through the proxy | `api/preview-proxy.ts` |
| ✅ | Add diagnostic `console.log` of every proxied request | `api/preview-proxy.ts` |
| ✅ | Commit + push (`66fb825`) and deploy to production (task def 160 stable) | verified |
| ✅ | Reset probe password (last attempt failed AWS Cognito policy — needs digit) | resolved with `Probe-NNNNNN-Az9!` template |
| ✅ | Run `probe-hibernate` + `probe-wake-existing` against production | sandbox `proj-1781063000651-58ed63b6` builds + serves on port 8081 |
| ✅ | First proxy fix verified: HTML loads at 200 with `<base href>` injected | direct curl + Playwright both confirm |
| 🔄 | Asset URLs absolute — `/_expo/static/...` ignores `<base href>` (only relative URLs use it). Fix: rewrite asset paths through proxy. | shipped in next deploy |
| 🔄 | Iframe asset requests have no auth header. Fix: set per-project cookie on HTML serve, accept it on subsequent requests. | shipped in next deploy |
| ⬜ | Re-deploy and verify: Playwright loads auth-proxied URL → React mounts → tic-tac-toe board renders | end-to-end proof |
| ⬜ | Drive Playwright at the live dashboard, click "5-Star Tic-Tac-Toe", screenshot the running game | dashboard-flow proof |
| ⬜ | Mirror ZionX 2.4.12–2.4.15 to ✅ in domain section below and close this group | — |

---

## 1. SERAPHIM

### 1.1 — Quality bar enforcement (Hooks 11–15)

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 1.1.1 | Hook 11 — Visual Polish Validator (12 checks, per-screen worst-of-N, 5/5 unit tests) |
| ✅ | 1.1.2 | Hook 12 — Persistence Auditor (4 hard rules, 4/4 unit tests) |
| ✅ | 1.1.3 | Hook 13 — Domain Fitness Auditor (7 domains, 12/12 unit tests) |
| ✅ | 1.1.4 | Hook 14 — Spec Card validator (10-key contract, 6/6 unit tests) |
| ✅ | 1.1.5 | Hook 15 — Onboarding Auditor (4 checks, 4/4 unit tests) |
| ✅ | 1.1.6 | `quality-gate-runner.ts` orchestrator with 2-retry loop |
| ✅ | 1.1.7 | Quality score persisted to `.meta/project.json` and rendered as sidebar pill |
| ✅ | 1.1.8 | Verified end-to-end in production (`proj-1780595277785-3ef0e002`, all scores ≥ 95) |
| ⬜ | 1.1.9 | Add Hook 11 hard-fail: `body-gradient-as-first-child` (LinearGradient absoluteFill must be direct child of root) |
| ⬜ | 1.1.10 | Add Hook 11 hard-fail: `gradient-stop-count-3plus` on body |
| ⬜ | 1.1.11 | Add Hook 11 hard-fail: `cta-uses-token-color` (regex against canonical hex list) |

### 1.2 — Steering & developer kit

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 1.2.1 | `00-quality-bar.md` (the 5 gates + Secrets Manager rule) |
| ✅ | 1.2.2 | `10-design-system.md` (Midnight Aurora tokens) |
| ✅ | 1.2.3 | `20-persistence.md` (zustand persist + AsyncStorage rules) |
| ✅ | 1.2.4 | `30-onboarding.md` (first-run walkthrough requirement) |
| ✅ | 1.2.5 | `40-store-readiness.md` (a11y + perf + store assets) |
| ✅ | 1.2.6 | `verify-app.sh` (sequential blocking gate) |
| ✅ | 1.2.7 | `check-no-static-data.mjs` scanner |
| ✅ | 1.2.8 | `frame-diff.ts` utility (pngjs-based) |
| ✅ | 1.2.9 | Kiro IDE hook: `spec-first-build.kiro.hook` |
| ✅ | 1.2.10 | Kiro IDE hook: `quality-gate-on-stop.kiro.hook` |
| ⏸ | 1.2.11 | Two IDE hooks above currently disabled (`.disabled` extension) per King's request |

### 1.3 — Design system enforcement (Midnight Aurora palette)

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | 1.3.1 | Replace `tokens.ts` in golden-starter with full Midnight Aurora palette |
| ⬜ | 1.3.2 | Insert SECTION 0.6 in `prompts.ts` listing banned hex + required gradient pairings |
| ⬜ | 1.3.3 | Wire new hardFail rules from 1.1.9–11 into Hook 11 |
| ⬜ | 1.3.4 | Re-baseline unit tests against new Midnight Aurora rules |
| ⬜ | 1.3.5 | Trigger fresh generation with stricter rules; confirm visual ≥ 90, persistence = 100, domain = 100, onboarding ≥ 90 |
| ⬜ | 1.3.6 | Capture screenshots showing populated state with violet/gold gradient hero |

### 1.4 — Persistence & observability infrastructure

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 1.4.1 | `S3WorkspaceStore` mirror layer with `hydrateAll()` at boot (11 unit tests) |
| ✅ | 1.4.2 | Workspace `setDurableStore` + write-through + S3 fallback on read |
| ✅ | 1.4.3 | `WakeStateStore` — S3-backed cross-task wake state (`wake-state/<id>.json`) |
| ✅ | 1.4.4 | `wakeSandbox` writes wake state to S3 with serialized persist chain + delayed final write |
| ✅ | 1.4.5 | `getSandboxStatus` reads S3 first, verifies URL reachability, falls back to idle on stale |
| ✅ | 1.4.6 | Preview proxy resolves URL from wake-state store first (cross-task coherent) |
| ✅ | 1.4.7 | `/health` exposes `persistence.durable: true` |
| ✅ | 1.4.8 | Sentry tunnel `/api/sentry-tunnel` (defeats mixed-content blocking) |
| ✅ | 1.4.9 | `flushSessionTrace` — periodic captureMessage so breadcrumbs reach Sentry |
| ✅ | 1.4.10 | `spec-runner.ts` with 16 rules; hourly cron + boot evaluator |
| ✅ | 1.4.11 | Live verified: hourly cron logs `[spec-cron] OK` against live Sentry |
| 🔄 | 1.4.12 | Tune false-positive Sentry rules (some fetch-category breadcrumbs need rule updates) |
| ⬜ | 1.4.13 | Migrate spec runner config to per-environment overrides |

### 1.5 — Obsidian vault sync

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 1.5.1 | `@seraphim/vault-sync` package: 3 layers (git / watcher / API) |
| ✅ | 1.5.2 | `ObsidianApiDriver` (`layer3-obsidian-api.ts`) — connect, healthCheck, search, get/put notes |
| ✅ | 1.5.3 | `VaultEventPublisher` bridges to event bus |
| ✅ | 1.5.4 | `VaultWriter` — structured agent-output → vault notes |
| ✅ | 1.5.5 | Vault `01 - Operations/Agent Comms/` structure created (Inbox / Outbox / Task Queue / Decision Log / Protocol) |
| ⬜ | 1.5.6 | Configure `seraphim/obsidian` secret in AWS Secrets Manager |
| ⬜ | 1.5.7 | Wire `OBSIDIAN_API_TOKEN` from Secrets Manager into `vault-sync` boot |
| ⬜ | 1.5.8 | Auto-persist Copilot conversations to `01 - Operations/Copilot Sessions/` |
| ⬜ | 1.5.9 | Document Obsidian plugin setup in `vault/README.md` (currently in `SETUP-GUIDE.md`) |

---

## 2. ZIONX (App Development)

### 2.1 — Agent harness (tool-using Claude loop)

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.1.1 | Spec authored: `requirements.md` / `design.md` / `tasks.md` in `.kiro/specs/zionx-agent-harness/` |
| ✅ | 2.1.2 | 8 lazy skill markdown files (frontend-app-design, zustand, expo-router, ai-apis, upload, appstore, security, code review) |
| ✅ | 2.1.3 | Agent core: 23 files in `agent/`, zero new tsc errors |
| ✅ | 2.1.4 | 10 tools shipped: read/write/edit/search/list_files/load_skill/run_command/screenshot/spawn_subagent/fetch_url |
| ✅ | 2.1.5 | Guardrails: command allowlist, budget caps, secret scrubber |
| ✅ | 2.1.6 | Context: workspace-summary, compaction, memory, message-builder |
| ✅ | 2.1.7 | `agentLoop` with prompt caching, streaming, scrubbed tool results |
| ✅ | 2.1.8 | E2B integration: `seraphim/e2b` secret, `E2BSandboxClient`, smoke test 444ms |
| ✅ | 2.1.9 | Custom E2B template scaffolded (`templates/e2b-sandbox/` + Dockerfile + egress.sh + watchdog.sh) |
| ✅ | 2.1.10 | 5 reviewer subagents wrapping Hooks 11–15 |
| ✅ | 2.1.11 | Auto-spawn reviewers when model goes silent + 2-retry loop |
| ✅ | 2.1.12 | `POST /app-dev/projects/:id/agent-message` SSE endpoint |
| ✅ | 2.1.13 | Project ownership middleware on every `/app-dev/projects/:id/*` route |
| ✅ | 2.1.14 | Eval suite: 18 fixed tasks + GitHub Action (`eval-suite.yml`) |
| ✅ | 2.1.15 | Eval suite ANTHROPIC_API_KEY set in GitHub Actions secrets |
| ✅ | 2.1.16 | Decommission signaling: legacy `/generate` emits Deprecation/Sunset/Link headers |
| ⬜ | 2.1.17 | Tool unit tests (deferred — agent is verified end-to-end in production) |
| ⬜ | 2.1.18 | Loop unit tests with mocked Anthropic SDK |
| ⬜ | 2.1.19 | Build + publish custom E2B template (`zionx-expo-base`) and switch `DEFAULT_TEMPLATE` |

### 2.2 — Generated-app quality

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.2.1 | AGENT BUILD PROTOCOL block (10 steps) at top of every generated `App.tsx` |
| ✅ | 2.2.2 | Smart project naming (`deriveProjectName`, 10/10 unit tests) |
| ✅ | 2.2.3 | Golden starter template (`templates/golden-starter/` with theme tokens, store, onboarding) |
| ✅ | 2.2.4 | Bundler overlays canonical config; sanitizes `app.json` plugins |
| ✅ | 2.2.5 | Dependency validator gates bundle on hallucinated packages |
| ✅ | 2.2.6 | `dist/index.html` patched to `<script type="module">` (defeats `import.meta` errors) |
| ✅ | 2.2.7 | Projects tab in dashboard (grid of completed apps with View/Edit) |
| ✅ | 2.2.8 | "Saved" badge with last-synced timestamp per project |
| ✅ | 2.2.9 | Bottom-tabs shim, phosphor icon expansion (Fire/Drop/Walking/+30 more), zustand shim |
| 🔄 | 2.2.10 | Visual capture against router-preserving runtime (Snack web bypasses expo-router) |

### 2.3 — Studio UI (3-column harness studio)

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.3.1 | Locked-viewport 220 / 380 / 1fr layout (`harness-studio-tokens.ts`) |
| ✅ | 2.3.2 | Top nav with Studio/Projects/Design tabs + `+ New App` CTA |
| ✅ | 2.3.3 | Sidebar: project list + quality pills + Logs/Files toggles + sandbox status pill |
| ✅ | 2.3.4 | Chat: collapsible plan card + tool-action chips + reviewer pills + auto-grow input |
| ✅ | 2.3.5 | Preview: 🌐/iOS/Android tabs + Refresh/Fullscreen/Phone actions |
| ✅ | 2.3.6 | Empty state hero + 4 example chips fill input |
| ✅ | 2.3.7 | Building / Waking / Error / Done overlay states |
| ✅ | 2.3.8 | Glass + depth (backdrop blur, hairline borders, soft shadows) |
| ✅ | 2.3.9 | Spring motion + reduced-motion media query |
| ✅ | 2.3.10 | QR modal at 240×240 via api.qrserver.com |
| ✅ | 2.3.11 | Logs / Files tab placeholders (real wiring deferred) |
| ✅ | 2.3.12 | `harness-studio-controller.ts` SSE → ChatMessage adapter |
| ✅ | 2.3.13 | `?harness=1` query param opt-in alongside legacy studio |
| 🔄 | 2.3.14 | Visual review of every studio screen (1–5 grade) |
| 🔄 | 2.3.15 | Layout overflow tests at 1600×1000 |
| ⬜ | 2.3.16 | Logs tab: real tail-from-sandbox stream |
| ⬜ | 2.3.17 | Files tab: real file tree |

### 2.4 — Preview pipeline (E2B sandbox)

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.4.1 | `E2BSandboxClient` with lazy provisioning + auto-resume + 20min default lifetime |
| ✅ | 2.4.2 | Server-side bundling (`bundleAndServe`) — stage / overlay / install / export / upload |
| ✅ | 2.4.3 | Static server supervisor: setsid + disown + restart-on-exit loop |
| ✅ | 2.4.4 | Verify localhost:8081 with 10× retry before reporting ready |
| ✅ | 2.4.5 | Auth proxy `/api/preview/:projectId/*` with HMAC tokens |
| ✅ | 2.4.6 | Wake state persisted to S3 (cross-task safe) |
| ✅ | 2.4.7 | Async wake (202 + polling) — defeats ALB 60s idle |
| ✅ | 2.4.8 | Workspace S3 fallback on read (multi-task safe) |
| ✅ | 2.4.9 | Preview proxy resolves URL from wake-state store first |
| ✅ | 2.4.10 | E2B sandbox lifetime extended mid-bundle via `extendTimeout` |
| ✅ | 2.4.11 | Tic-tac-toe rendering verified via DIRECT sandbox URL (`https://8081-iy1bhjz48...`) |
| 🔄 | 2.4.12 | **Dashboard preview iframe end-to-end** — King clicks project → preview iframe loads via `/api/preview/<id>` → game renders. Currently broken at the auth-proxy layer. |
| ⏱ | 2.4.13 | Route `matchPath` wildcard `/*` not implemented — paths with extra segments (e.g. `/preview/:id/_expo/static/js/main.js`) fall through to 404. **Stopped at:** identified root cause in `services/api-routes.ts:528`. **Resume by:** extend matchPath to treat `*` as single-segment wildcard and trailing `**` as multi-segment; verify `/preview/:id/_expo/static/js/main.js` matches `/preview/:projectId/*`. |
| ⏱ | 2.4.14 | Proxy returns 404 from upstream Python http.server even though direct curl returns 200 — header/path forwarding mismatch. **Stopped at:** confirmed proxy reaches upstream (sees `Server: SimpleHTTP/0.6 Python/3.11.2`) but path resolves wrong. **Resume by:** add `console.log` of target+headers in `proxyTo()`, redeploy, click iframe, read CloudWatch to see actual fetch URL. |
| ⬜ | 2.4.15 | Inject `<base href="/api/preview/<id>/">` into proxied index.html so all `_expo/static/...` asset URLs route back through the proxy. (Depends on 2.4.13.) |
| ⬜ | 2.4.16 | Add 502/connection-refused retry-with-backoff in preview proxy fetch |

### 2.5 — Acceptance tests

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.5.1 | Tic-tac-toe 10/10 acceptance steps passing (`scripts/section-6-acceptance.ts`) |
| ✅ | 2.5.2 | Tic-tac-toe screenshots in `scripts/section-6-output/` |
| ✅ | 2.5.3 | Habit tracker 9/10 acceptance steps passing (`scripts/section-7-habit-tracker.ts`) |
| ✅ | 2.5.4 | Habit tracker screenshots in `scripts/section-7-output/` |
| ✅ | 2.5.5 | Eval suite scaffolded (18 tasks + 5 scorers + runner) |
| ⬜ | 2.5.6 | First eval baseline run (commit `agent/evals/baseline.json`) |
| ⬜ | 2.5.7 | Habit tracker step 10 (iteration didn't finish in 4-min budget — flaky timing) |
| ⬜ | 2.5.8 | Tic-tac-toe end-to-end via dashboard click (not direct API) |

### 2.6 — Studio spec compliance loop

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.6.1 | `docs/zionx-studio-spec.md` (full layout, buttons, lifecycle, SSE events) |
| ✅ | 2.6.2 | `docs/research/vibecode-functionality-audit.md` (cited research) |
| ✅ | 2.6.3 | `services/spec-runner.ts` with 16 rules (8/8 unit tests) |
| ✅ | 2.6.4 | `GET /app-dev/spec`, `POST /app-dev/spec/evaluate` endpoints |
| ✅ | 2.6.5 | Boot-time evaluator on dashboard mount |
| ✅ | 2.6.6 | Hourly cron in production-server scheduling |
| ✅ | 2.6.7 | Synthetic harness `scripts/stream-f-synthetic-traffic.ts` proven live |
| 🔄 | 2.6.8 | Triage current Sentry violations: `send-creates-or-streams`, `build-clicks-must-respond` |
| ⬜ | 2.6.9 | Tune `breadcrumbMessage(b)` for fetch-category breadcrumbs |
| ⬜ | 2.6.10 | Run live full session and reach `violations: []` |

### 2.7 — Decommission of legacy paths

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 2.7.1 | Legacy `/generate` emits Deprecation/Sunset/Link headers |
| ✅ | 2.7.2 | `LLMService.streamGeneration` JSDoc tagged `@deprecated` |
| ✅ | 2.7.3 | `DECOMMISSION-LEGACY.md` written with sunset date 2026-09-01 |
| ⬜ | 2.7.4 | Switch dashboard's default route to `?harness=1` |
| ⬜ | 2.7.5 | Hard-remove `streamGeneration` after 2026-09-01 |
| ⬜ | 2.7.6 | Remove Snack-only code paths from `snack-client.ts` |

---

## 3. HERMES (messaging & routing)

### 3.1 — Agent message router

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | 3.1.1 | Vault `Agent Comms/` structure created (Inbox / Outbox / Task Queue / Decision Log / Protocol) |
| ✅ | 3.1.2 | Copilot Protocol schema defined and documented |
| ⬜ | 3.1.3 | Hermes process: watch `Inbox.md` for `status: open` messages |
| ⬜ | 3.1.4 | Schema validator with structured rejection notes |
| ⬜ | 3.1.5 | Route messages to addressee (Kiro → `.kiro/agent-tasks/`, ZionX → API call, etc.) |
| ⬜ | 3.1.6 | Status transitions (open → acknowledged → in-progress → done) |
| ⬜ | 3.1.7 | Decision Log audit trail |
| ⬜ | 3.1.8 | TASK-2026-06-03-002 from `vault/copilot/copilot-conversations/` (Activate Hermes Routing) — open since 2026-06-03 |

### 3.2 — Notification & escalation

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | 3.2.1 | Subscribe to Kiro task events (file system: `.kiro/agent-tasks/completed/` + `failed/`) |
| ⬜ | 3.2.2 | Subscribe to Sentry alert webhooks |
| ⬜ | 3.2.3 | Subscribe to build pipeline events (`appdev.build.failed`, `appdev.quality.gate.failed`) |
| ⬜ | 3.2.4 | Routing table (event → destination + escalation timer) |
| ⬜ | 3.2.5 | King's end-of-day summary (deferred message delivery) |
| ⬜ | 3.2.6 | Critical-alert immediate-email path |

### 3.3 — Cross-agent contract enforcement

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | 3.3.1 | Schema validator (id / from / to / type / priority / status) |
| ⬜ | 3.3.2 | Track open tasks + follow up on overdue items |
| ⬜ | 3.3.3 | Append routing decisions to Decision Log |
| ⬜ | 3.3.4 | Configure `seraphim/hermes` secret if Hermes needs an API key |
| ⬜ | 3.3.5 | Hermes Desktop integration (existing local app per `SETUP-GUIDE.md`) |

---

## 📋 Closed work groups

(Empty — closed groups will land here with their start/finish dates and
the domain rows they completed.)

---

## How to add a new task or request

1. **Open a new group** at the top under "Active Work Groups". Give it
   a `G<n>` ID, a one-line goal, and the domain rows it touches.
2. List every concrete sub-step as a checkbox row inside the group.
3. As you finish each row, mark it ✅ in the group AND in the matching
   domain row below.
4. When all group rows + their domain rows are ✅, move the group block
   to "Closed work groups" with a finish date.
5. For raw additions (not part of an active group): pick the right
   domain (1 / 2 / 3) and sub-section, use the next available number
   (never reuse or renumber), and add a `⬜` row.

If a task spans more than ~3 days of work, break it into sub-tasks
and add them under the same sub-section.

---

## Where the historical detail lives

Every old `LIVE-*.md`, `rebuild-*.md`, and per-stream task file moved
to `archive/` with full session-by-session detail and commit hashes.
Pull them up with `read_file` when you need the long-form context.
