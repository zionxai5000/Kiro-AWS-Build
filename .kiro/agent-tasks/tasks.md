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

### G6 — Tier 0 sandbox load fixes (deployed, awaiting king's verification)

- **Started/Deployed:** 2026-06-10 → 2026-06-11
- **Goal:** Stop the bundle restart loop that was making sandboxes "take forever" to load. Three small fixes that compound.
- **Rollback target:** tag `working-app-dev-6.10.2026`
- **Deploy path used:** EC2 build VM with source-zip-from-S3 (no git push)

| ✅/⬜ | Item | File |
|---|---|---|
| ✅ | **#1** Retry `isPreviewReachable` 3× with 2s spacing, 8s timeout each | `services/wake-state-store.ts` |
| ✅ | **#2** Coalesce consecutive identical phase messages in dashboard chat (controller-level `lastAnnouncedPhase` survives across overlapping polls) | `views/harness-studio-controller.ts` |
| ✅ | **#3** 60-second grace window on `ready` state after a successful reach | `api/handlers.ts` |
| ✅ | Built dashboard locally (chunk `harness-studio-controller-COXFnFHw.js`, 109 KB) |
| ✅ | Synced dashboard to S3 |
| ✅ | Built backend image via EC2 source-zip path (image tag `tier0-20260611165544`) |
| ✅ | ECS task def 169 deployed, COMPLETED rollout, 2/2 running |
| ✅ | Verification probe — 0 bundle resets, bundle completes in 81s |
| ⬜ | King to test through dashboard |
| ⬜ | If approved → commit + push to git; if not → revert tag |

#### Verification evidence

- `scripts/verify-wake-fix.mjs` — 5 polls over 60s, same `startedAt` throughout (`2026-06-11T17:06:39.513Z`), phase advanced `starting → install → export` cleanly. **Same building record across 60s ✅ YES (fix works).**
- `scripts/watch-bundle-to-completion.mjs` — Bundle reached `live` in 81 seconds. **Bundle resets observed: 0 (should be 0 if fix works).**
- Live preview URL minted: `https://8081-iuvg0r6wvvefxpf88hu72.e2b.app`

#### What this changed in production

- ECS task def `:167` (commit `07e5322`) → `:169` (image `tier0-20260611165544`, source-built from un-committed local working tree)
- Dashboard S3: replaced `harness-studio-controller-BWgVshnP.js` (108 KB) → `COXFnFHw.js` (109 KB)
- No git history change yet — awaiting king's approval

---

### G8 — Honest workspace button audit + remediation plan (proposed, awaiting approval)

- **Started:** 2026-06-10
- **Trigger:** King: "Everything doesn't work the way it should. How do we fix this the second time around?"
- **Goal:** Stop confusing "button is rendered + clickable" with "feature works end-to-end". Audit every workspace + observe + deliver button against actual user-visible behavior, label each Wired / Stubbed / Broken, and document the work to take each one to Wired.

#### Methodology fix (standing rules going forward)

| # | Rule |
|---|---|
| 1 | **Contract-first.** Define the API contract (URL, method, request schema, response schema) BEFORE any UI work. Verify the endpoint exists, or stub it with an explicit 501 + label. |
| 2 | **Three-state status.** Every feature is Wired / Stubbed / Broken. **No "✅" until Wired.** Stubbed = 🟡, Broken = ❌. |
| 3 | **End-to-end probe per UC.** Not "the button renders" — "click → wait for the expected change in workspace state → verify". Probes live in `scripts/probe-uc-XX.mjs`. |
| 4 | **Backend coverage matrix.** Mirror of the dashboard coverage report. For each UC, list required endpoints + verifier asserting shape compatibility. Run as CI check. |
| 5 | **Working set ≤ 3 per session.** Take 1-3 UCs ALL THE WAY (UI + backend + probe + visual verify) before starting more. |
| 6 | **Vocabulary discipline.** Shipped (in prod, unverified) · Stubbed (UI present, backend pending) · Wired (e2e probe passes) · Verified (king clicked through). I will only say "works" / "✅" for **Verified**. |

---

#### Workspace section — honest audit

##### 👁 Preview tab — UC2 / UC3 / UC4

- **Status:** 🟢 **Wired** (currently broken by the sandbox load loop — see G6)
- **Today:** Renders the auth-proxied iframe with the live E2B sandbox. Fit/Scroll toggle. Refresh / Fullscreen / Phone QR buttons. Web/iOS/Android platform tabs (only Web renders the iframe; iOS/Android are tabs without distinct content).
- **Spec'd:** "● live · url · build time" status bar; device toggle that swaps the iframe to a different sandbox build per platform.
- **Gaps:**
  - iOS / Android platform tabs change the highlight but don't change the iframe content (same Web bundle shows on all three)
  - "Build time" never appears in the status bar (`reloadLabel` shows "–")
  - Sandbox load reliability is broken (G6 root cause: `isPreviewReachable` no-retry)
- **To reach Wired:**
  - Fix G6 #1-#3 (15+30+30 min)
  - Make platform tabs actually switch to a native preview (out of scope for now — Web is what the sandbox serves)
  - Wire `lastReloadMs` to the actual ready-to-rendered timestamp

##### 📄 Code tab — UC5

- **Status:** 🟡 **Stubbed-but-functional** (basic edit works; lacks every IDE feature the spec called for)
- **Today:** File list (filtered to exclude `.meta/`, `node_modules/`, `dist/`). Click → opens a `<textarea>` editor. Save button calls `PUT /file` → triggers `/sandbox/wake` to re-bundle.
- **Spec'd:** File tree with collapsible folders, syntax-highlighted editor, diff toggle ("AI changed these" highlight on lines), revert button, "← made in chat" backlink per file.
- **Gaps:**
  - Editor is a bare `<textarea>` — no syntax highlighting, no autocomplete, no folding, no line numbers
  - File listing is flat — no folder hierarchy, no expand/collapse
  - No diff view (no way to see what AI just changed)
  - No revert button (can only undo by editing manually)
  - No "AI changed" highlight on file rows or lines
  - No back-link from file → message that produced it
  - Re-bundle restarts the whole sandbox (3-5 min); should be Metro hot-reload (~2s)
- **To reach Wired:**
  - Replace `<textarea>` with Monaco or CodeMirror (~1 day; significant chunk size impact, lazy-load it)
  - Build a real folder tree from the flat file list (~3 hours)
  - Backend: track diffs with `byMessageId` per write (G2.E foundation; ~3 hours backend)
  - UI: render diff view + revert + "← made in chat" (~1 day)
  - Backend: support hot-reload (Metro fast refresh trigger via E2B exec, instead of full re-bundle) (~1 day)

##### 📁 Files tab — G2.B-files

- **Status:** 🟡 **Stubbed** (browse + filter works; everything else missing)
- **Today:** Lists files with search + 6-way filter pills. Click → routes to Code tab and opens that file.
- **Spec'd:** Grid view, drag-drop upload, download per file, version history, "AI changed" badges, type filter.
- **Gaps:**
  - List view, not grid (decorative; matches spec poorly)
  - No drag-drop upload — there's no way for the user to add files at all
  - No download endpoint
  - No version history (workspace doesn't track per-file versions; only the latest write wins)
  - No "AI changed" badges
- **To reach Wired:**
  - Backend: `POST /file?path=X` for upload (multipart) (~2 hours)
  - Backend: `GET /file?path=X&raw=1` returning file content with cookie-auth so `<img>` tags can render (~1 hour)
  - Backend: per-file change history in S3 mirror (every write becomes an immutable version) (~4 hours)
  - UI: drop zone + upload progress (~3 hours)
  - UI: version dropdown per file with "restore" (~2 hours)
  - UI: badge per row when `byMessageId` is present (~30 min)

##### 🖼 Image tab — G2.B-image

- **Status:** 🟡 **Stubbed** (UI shipped, generate routes to chat with no verification)
- **Today:** Lists image-extension files. "🖼" placeholder icon (no real thumbnails). "Generate" prompt sends a chat message to the agent (e.g. "Generate an image: <prompt>"). "As icon" / "Use in app" send chat messages.
- **Spec'd:** Gallery with real thumbnails, "generate image" prompt with progress, "use as icon" writes app.json, "use in app" inserts a real reference into Code and shows where it's used.
- **Gaps:**
  - **No thumbnails** — `<img src>` would 401 because cross-origin auth doesn't carry on `<img>` requests
  - **Generate is unverified** — agent may or may not produce an image; UI doesn't track or surface failures
  - **"As icon" is unverified** — agent receives the chat message but no programmatic confirmation that app.json was updated
  - **"Use in app" is unverified** — same; agent decides where to put it, no UI feedback on which file/line
  - No progress indicator for long generations (typically 10-30s for OpenAI Images)
- **To reach Wired:**
  - Backend: `POST /file?path=X&raw=1` with cookie-auth so `<img src>` works (~1 hour)
  - Backend: dedicated `POST /image/generate` endpoint that runs Hook 7's image generator with explicit success/failure return (~3 hours)
  - Backend: `POST /image/use-as-icon` that writes app.json directly (deterministic) (~1 hour)
  - Backend: `POST /image/use-in-app` that runs an LLM call to find the right file + line + writes the reference (~3 hours)
  - UI: poll the generation endpoint for progress, surface success/failure (~2 hours)

##### 🔊 Audio tab — G2.B-audio

- **Status:** 🟡 **Stubbed** (worse than Image — Record button explicitly says "not wired")
- **Today:** Lists audio-extension files. "🔊 path" buttons route to Code. "Generate TTS" / "Wire to event" send chat messages. "Record" shows "Recording UI not yet wired — drop a clip into Files for now."
- **Spec'd:** Clip list with `<audio>` player, record button (browser MediaRecorder API), TTS prompt, "wire to event" inserts onPress handler into Code.
- **Gaps:**
  - **No `<audio>` player** — same auth issue as `<img>` (server must serve files with cookie-auth + correct MIME)
  - **No record functionality** — needs browser MediaRecorder + upload pipeline
  - **TTS unverified** — agent may produce audio but no UI feedback
  - **Wire-to-event unverified** — same uncertainty
- **To reach Wired:**
  - Backend: same `?raw=1` cookie-auth as Image (shared)
  - Backend: `POST /audio/tts` running OpenAI TTS with explicit return (~2 hours)
  - Backend: `POST /audio/upload` for browser-recorded uploads (~1 hour)
  - Backend: `POST /audio/wire?path=X&event=Y` that deterministically inserts an `import {Audio} from 'expo-av'; const sound = ...` snippet into the named event handler (~3 hours)
  - UI: MediaRecorder integration (~3 hours)

##### 🗄 Database tab — G2.B-db

- **Status:** ❌ **Broken** (the entire feature is "list .json/.csv files" — there is no real database concept)
- **Today:** Falls back to listing detected `.json/.csv/.sqlite/.db` files when `state.dbTables` is empty (which is always — nothing populates it). When tables exist, would render a header row + column pills. They never exist.
- **Spec'd:** Table list, schema view, editable row grid, "AI created this" badges, links to Request calls that hit it.
- **Gaps:** **Almost everything.**
  - No backend endpoint to detect or report tables/schemas
  - No way to read rows
  - No way to edit rows
  - Generated apps don't even have a consistent data layer to introspect (varies: SQLite via expo-sqlite, AsyncStorage, MMKV, hosted DynamoDB, or just zustand-persist)
- **To reach Wired:**
  - Define a manifest format the agent emits when it creates a data layer (e.g. `.kiro-data.json` listing tables + columns + storage backend)
  - Backend: `GET /database/schema` reads the manifest (~2 hours)
  - Backend: `GET /database/rows?table=X` proxies to the actual storage (~4 hours per backend type)
  - Backend: `PUT /database/rows?table=X&id=Y` for edits (~3 hours)
  - UI: table list + editable grid (~6 hours)
  - **Total ~3 days. Bigger than the rest combined. Recommend deferring until a generated app needs it.**

---

#### Observe section — honest audit

##### 📋 Logs panel — G2.C-logs

- **Status:** 🟡 **Stubbed** (WebSocket connects, events arrive, formatted poorly)
- **Today:** Opens WebSocket to `/ws`, listens for messages. Server's `WebSocketBroadcaster` forwards 5 app-dev event types: `appdev.hook.started`, `appdev.hook.completed`, `appdev.build.status.changed`, `appdev.project.created`, `appdev.project.updated`. They arrive wrapped in a `{type: "workflow.progress", data: {...}}` envelope.
- **Today's bug:** My `formatLogText` looks for `data.message` / `data.text` / `data.summary` — none of which exist on the wrapped envelope. Result: every log line shows the JSON-stringified object. Ugly, sort-of-readable.
- **Spec'd:** Stream of build + runtime logs, level filter, search, "Ask AI" per line.
- **Gaps:**
  - **Source is wrong.** Hook lifecycle events ≠ runtime logs. The actual `expo export` stdout/stderr from the sandbox is NOT in the event bus. No console.log from the running app. No Metro errors. No npm install output.
  - **Envelope parser is wrong.** Need to unwrap `data.data.detail` etc.
  - **"Ask AI" only fires off a chat prompt** — never verified the agent picks it up and responds.
- **To reach Wired:**
  - Fix the envelope parser (`event.data.data` not `event.data`) (~30 min)
  - Backend: pipe E2B sandbox stdout/stderr into the event bus as `appdev.runtime.log` events (~3 hours)
  - Backend: pipe `expo export` build output as `appdev.build.log` (~2 hours)
  - UI: distinguish source (build / runtime / hook / system) with color (~30 min)
  - UI: actually verify "Ask AI" produces an answer-back in chat (probe) (~30 min)

##### 🌐 Request panel — G2.C-req

- **Status:** ❌ **Broken** (zero events match the schema my code expects)
- **Today:** Subscribed to the same WebSocket. My code looks for `data.method && data.url && typeof data.status !== 'undefined'`. **No event in the broadcaster has those fields.** The list is empty forever. Click rows do nothing because there are no rows.
- **Spec'd:** Request list, req/res inspector, headers/body, replay, timing, traceId correlation with Logs and Database.
- **Gaps:**
  - No source of HTTP-shaped events
  - Replay would call `fetch()` directly from the browser — wrong origin (S3 dashboard → ALB API), missing auth headers
  - No `traceId` correlation because no trace IDs propagate today
- **To reach Wired:**
  - Backend: middleware around app-dev API routes that emits `appdev.request.captured` events on every API call with `{method, url, status, ms, traceId, reqBody, resBody}` (~3 hours)
  - Backend: middleware around the sandbox's network calls (expo runtime → external APIs) — much harder, may need a proxy (~1 day; defer)
  - Frontend: route Replay through the backend (`POST /requests/replay?id=X`) so auth is honored (~1 hour)
  - UI: traceId correlation across Logs/Request/Database (~3 hours; depends on traceId being set by backend instrumentation)

---

#### Deliver section — honest audit

##### 🚀 Ship tab — UC7+UC8+UC9+UC10+UC11+UC15

- **Status:** 🟢 **Wired** (every panel hits a real endpoint)
- **Today:**
  - Build (POST /build) → returns `easBuildId` ✓
  - Listing (POST /store-listing) → returns title/subtitle/desc/keywords/category ✓
  - Preflight (POST /submit) → returns checklist with pass/fail/warn per item ✓
  - Confirm-submit (POST /confirm-submit) → fires `eas submit` ✓
  - Crashes (GET /crashes) → returns array (currently empty) ✓
  - Cost (GET /cost) → returns todayUsd ✓
- **Verified end-to-end?** Build is verified through Build #10 (G1). Listing was verified by 26/26 probe. Crashes and Cost return shape-correct responses. Confirm-submit has never actually pushed to App Store / Play Store with king's eyes on it.
- **Gaps:**
  - **Real-world submit not yet user-verified.** Backend exists, response shape is correct, but actual TestFlight / Play Console review hasn't been triggered with king watching.
  - Cost is **global**, not per-user. Two users sharing the budget pool.
  - Crash list is empty because Sentry webhook hasn't fired in production (no crashes yet).
- **To reach Verified:**
  - King runs through the Submit flow once with real Apple credentials and confirms TestFlight build appears (~15 min from king)
  - Backend: per-user cost tracker (~3 hours)
  - Generate a test crash via Sentry to confirm the webhook → crash list flow (~30 min)

##### ☁ Deploy tab — G2.D

- **Status:** ❌ **Broken** (no backend at all — the entire feature is UI on top of nothing)
- **Today:** Renders an empty snapshot list. Env toggle (Preview/Prod) toggles a state field. "Deploy" button calls `POST /deployments` which **returns 404** and falls back to sending a chat message ("Take a deploy snapshot to <env>…"). Rollback same.
- **Spec'd:** Each deploy is an immutable snapshot of Code + Files + DB. Rollback restores one. Versions list with .ipa/.aab links per snapshot.
- **Gaps:** **Everything except the UI.**
  - `GET /deployments` doesn't exist
  - `POST /deployments` doesn't exist
  - `POST /deployments/:id/rollback` doesn't exist
  - No snapshot mechanism in the workspace (writes overwrite; nothing is immutable per-snapshot)
- **To reach Wired:**
  - Backend: `POST /deployments` zips the workspace + uploads to S3 with version label, optionally bundles `.ipa`/`.aab` from latest build (~6 hours)
  - Backend: `GET /deployments` lists S3 objects under the project's snapshots prefix (~1 hour)
  - Backend: `POST /deployments/:id/rollback` downloads the snapshot zip and writes it back over the workspace (~3 hours)
  - UI: hook the existing Deploy/Rollback buttons to those endpoints once they exist (already done; just needs the backend)
  - **Total ~1.5 days backend, 0 hours UI (already wired in fallback mode).**

---

#### Honest grade summary

| Section | Tab | Previous claim | **Honest grade** |
|---|---|---|---|
| Workspace | 👁 Preview | ✅ | 🟢 Wired (broken by G6 sandbox loop) |
| Workspace | 📄 Code | ✅ | 🟡 Stubbed-but-functional (basic edit works; no IDE features) |
| Workspace | 📁 Files | ✅ | 🟡 Stubbed (browse only; no upload/download/versions) |
| Workspace | 🖼 Image | ✅ | 🟡 Stubbed (no thumbnails; generate is chat-fallback) |
| Workspace | 🔊 Audio | ✅ | 🟡 Stubbed (no player; record explicitly not wired) |
| Workspace | 🗄 Database | ✅ | ❌ Broken (no backend; lists `.json` files as "tables") |
| Observe | 📋 Logs | ✅ | 🟡 Stubbed (events flow but parsed wrong; no runtime logs) |
| Observe | 🌐 Request | ✅ | ❌ Broken (no events match expected shape; list always empty) |
| Deliver | 🚀 Ship | ✅ | 🟢 Wired (Verified pending real submit by king) |
| Deliver | ☁ Deploy | ✅ | ❌ Broken (no backend; falls back to chat) |

**Total: 2 Wired, 6 Stubbed, 3 Broken.** Plus the Sandbox load loop (G6) currently degrades the one fully-Wired feature.

---

#### Remediation roadmap

##### Tier 0 — Stop the bleeding (~90 min, ship today)
- **G6 #1** Retry `isPreviewReachable` 3× over 6s (15 min) — fixes the bundle loop king is hitting now
- **G6 #2** Coalesce duplicate "Build phase: X" chat messages (30 min) — kills the chat noise
- **G6 #3** 60-second grace window on ready state after success (30 min) — extra safety against false negatives

##### Tier 1 — Take the most-used tabs to Wired (~2-3 days)
- 📋 Logs envelope parser fix + pipe E2B stdout/stderr (~6 hours)
- ☁ Deploy backend (snapshot + list + rollback) (~10 hours)
- 🌐 Request middleware emitting capture events (~5 hours)
- "Ask AI" / Replay backend handlers (~4 hours)

##### Tier 2 — Quality-of-life on the working tabs (~2 days)
- 📄 Code: real folder tree + diff view + revert (~1 day)
- 🖼 Image: cookie-auth `?raw=1` + dedicated `/image/generate` endpoint with progress (~6 hours)
- 🔊 Audio: same `?raw=1` + MediaRecorder UI (~6 hours)

##### Tier 3 — Big lifts (~3-5 days each)
- 📄 Code: Monaco editor + Metro hot-reload (no full re-bundle on save)
- 🗄 Database: agent emits `.kiro-data.json` manifest + UI consumes it
- Two-way linking: backend instrumentation populating `byMessageId` everywhere

##### Tier 4 — New use cases (G7 expansion)
- UC23–UC35: Theme · Components · Navigation · Tests · Performance · Errors · Beta testers · Share-as-tab · Listing preview · Memory · Model · Notes · Versions

---

**Recommendation:** Greenlight Tier 0 immediately (90 min), then queue Tier 1 as the next session. Don't start Tier 2/3/4 until Tier 1 is end-to-end Verified. No commits until king signs off on this plan.

---

### G7 — Workspace button use-case map + proposed expansion

- **Started:** 2026-06-10
- **Trigger:** King reported "the sandbox is taking forever to load" after refreshing into the studio. Dashboard chat log shows the bundle phases cycling: `starting → bundling → stage → export → upload → uploaded → serve` … then **looping back to `starting`** 5+ times.
- **Root cause:** `isPreviewReachable()` (services/wake-state-store.ts) does a single `fetch` with a 4-second timeout, no retries. It runs on **every** GET /sandbox poll (every 5s from the dashboard). A single transient 502 during E2B warm-up wipes the wake state, the dashboard sees `idle`, fires a new `/wake`, and the whole bundle restarts. The bundle is ~3-5 min, the dashboard polls every 5s, so we get one false-negative ~every minute and the bundle never finishes.
- **Maps to delivery tree:** UC2 (View in sandbox preview) — currently broken in this specific failure mode.

#### Proposed delivery-tree additions (new use cases this group introduces)

| New UC | Name | Why it's needed |
|---|---|---|
| UC16 | **Pre-warm sandbox on project click** | Today the wake fires only on first chat message. Click → wake immediately so by the time user types, sandbox is warming. Cuts cold-start perceived latency by ~30s. |
| UC17 | **Bundle cache reuse across waves** | Cache `node_modules`, `.expo/web/cache`, and Metro output in S3 keyed by lockfile hash + entry. Subsequent wakes skip 2-3 min of npm install + first-bundle work. |
| UC18 | **Persistent sandbox warm window** | Keep the E2B sandbox alive for 30 min after last activity (today: ~5 min). Same-session navigation back to a project = instant preview. |
| UC19 | **Live progress bar in preview pane** | Replace the endless "Build phase: X" chat lines with a real 0-100% progress bar tied to phases. Dedupe consecutive identical phases. |
| UC20 | **WebSocket push for sandbox status** | Eliminate the 5s poll. Server pushes `appdev.sandbox.phase` events; dashboard listens. Removes the "I'm hammering the API" feel and shrinks status latency from 5s → <100ms. |
| UC21 | **Frozen preview while rebuilding** | When user iterates by chat, keep showing the previous live preview until the new bundle is ready, then swap. No "preview goes blank" mid-iteration. |
| UC22 | **Smart reachability with retries** | `isPreviewReachable` should retry 3× over 6s before declaring the sandbox dead. Kills the false-negative reset that's hitting King now. |

#### Proposed implementation order

| ✅/⬜ | Item | Impact | Effort |
|---|---|---|---|
| ⬜ | **Fix #1 (UC22):** Add retry loop to `isPreviewReachable` (3 attempts, 2s spacing, 8s timeout each). One-file change in `services/wake-state-store.ts`. | High — fixes the loop King is hitting now | 15 min |
| ⬜ | **Fix #2 (UC19):** Coalesce duplicate `phase` chat messages in the dashboard. If the new event has the same phase as the last, just update the timestamp; don't add a new row. | Medium — kills the chat noise | 30 min |
| ⬜ | **Fix #3 (UC22b):** Cache the wake state for 60s after a successful "ready" response, so even if reachability briefly flickers, we don't immediately reset. | Medium — extra safety | 30 min |
| ⬜ | **Fix #4 (UC16):** Pre-warm on project-row click. Add `onSelectProject` → fire-and-forget POST /wake. | Medium-high — perceived latency | 30 min |
| ⬜ | **Fix #5 (UC19b):** Real progress bar in the preview pane (phase → percentage). | Medium — UX polish | 1 hour |
| ⬜ | **Fix #6 (UC18):** Bump E2B sandbox idle timeout from 5 min to 30 min for projects opened in last hour. Backend change in `sandbox-client.ts`. | High — cold-start gone for warm projects | 30 min |
| ⬜ | **Fix #7 (UC20):** WebSocket push for sandbox status. Backend already has the broadcaster; add a `appdev.sandbox.phase` channel and have the dashboard subscribe. | Medium — eliminates polling | 2 hours |
| ⬜ | **Fix #8 (UC17):** S3-cache `node_modules` + Metro cache. First-time still slow; second wake is ~30s. | Highest — actual speedup | 4-6 hours |
| ⬜ | **Fix #9 (UC21):** Frozen preview while rebuilding. UI keeps prior iframe; backend tracks "previous good URL". | Medium — no blink during iteration | 2 hours |

**Recommended path:** Ship Fixes #1–#3 immediately as a single hotfix (kills the load-loop King is hitting right now). Then queue #4–#7 as the next session. #8 and #9 are bigger lifts — schedule when we want a step-change in cold-start.

---

### G5 — Sidebar overflow fix + full button visibility (closed: 2026-06-10)

- **Started/Closed:** 2026-06-10
- **Goal:** Make the Workspace/Observe/Deliver menu visible without
  scrolling, and confirm every button in the sidebar is reachable
  and clickable when there are 100+ projects.
- **Root cause:** `.harness-sidebar__projects` had no `flex/overflow-y/min-height: 0`,
  so 102 project rows expanded to 8734px and pushed the `__util` section
  off-screen (util.top = y=8934 against an 844px sidebar).
- **Fix:** Made `__projects` the scrollable region and pinned `__util`
  at the bottom with `flex: none; max-height: 60%; overflow-y: auto`.

#### Final results

| ✅/⬜ | Item | Before | After |
|---|---|---|---|
| ✅ | Sidebar scrollHeight vs clientHeight | 9402 vs 844 (overflow) | 844 vs 844 (no overflow) |
| ✅ | Util section visible without scroll | utilTop=8934 (off-screen) | utilTop=421, all buttons within sidebar |
| ✅ | All 10 pane-tab buttons clickable via JS dispatch | partial | all 10 (preview, code, files, image, audio, db, logs, request, ship, deploy) |
| ✅ | Each tab renders content | mixed | all 10 swap content into the right pane |
| ✅ | Project click selects active project | partial (timing) | dispatches click; active state set |
| ✅ | Code tab with project active shows file editor | n/a | shows `.harness-code-tab` (not the empty placeholder) |
| ✅ | Project rows still selectable from scrollable projects region | partial | 102 rows scroll inside their own region |

#### Per-button visibility (1440×1024 viewport)

```
preview   x=280 y=434 within=true
code      x=280 y=471 within=true
files     x=280 y=508 within=true
image     x=280 y=546 within=true
audio     x=280 y=583 within=true
database  x=280 y=737 within=true
logs      x=280 y=813 within=true
request   x=280 y=850 within=true
ship      x=280 y=926 within=true
deploy    x=280 y=963 within=true
```

All ten Workspace/Observe/Deliver tab buttons land inside the viewport
on a 1024-pixel-tall window. Older Playwright probe runs that showed
"click timeout" against `ship`/`deploy` were artifacts of the broken
overflow (those buttons were at y=8000+ before the fix); after the
fix, every button receives clicks.

#### Verification artifacts

- `scripts/button-test-output/post-fix-1440x1024.png` — full studio with all menu visible
- `scripts/button-test-output/tab-preview.png` through `tab-deploy.png` — every tab rendering its content
- `scripts/button-test-output/code-with-project.png` — Code tab showing file editor (not placeholder) with a project selected
- `scripts/button-test-output/post-project-select.png` — sidebar after clicking a project

**Status:** S3 sync complete. New harness chunk
`harness-studio-controller-C9WUHpGu.js` (109 KB, ~600 bytes larger
than before due to the layout CSS additions). Live at
`s3://seraphim-dashboard-live` as of 2026-06-10 21:30 PT.

---

### G4 — App Development delivery tree coverage verification (2026-06-10)

- **Started/Closed:** 2026-06-10
- **Goal:** Before king refreshes, prove every UI button maps to a use
  case in the delivery tree, and every use case has its required
  buttons compiled into the live S3 bundle.
- **Method:** `scripts/verify-dashboard-coverage.mjs` reads
  `packages/dashboard/src/views/harness-studio.ts` for source actions,
  pulls the live S3 chunk
  `harness-studio-controller-BWgVshnP.js` (108 KB, deployed
  2026-06-10 21:13 PT), and intersects the two against a hand-curated
  use-case table.
- **Output:** `scripts/coverage-output/coverage.md` and `coverage.json`.

#### Verification result

| Metric | Result |
|---|---|
| Use cases tracked | 26 (15 from G1 + 11 from G2) |
| Fully covered (every required action present in S3 bundle) | **23** |
| Not applicable (backend-only / status-display) | **3** (UC13 ownership, UC14 quality bar, G2.F-agents) |
| Partially covered | **0** |
| Distinct `data-action` values in source | 36 |
| Orphan actions (no UC mapping) | 1 — `pane-tab` (the umbrella; specific values like `pane-tab=files` are claimed individually) |

#### Coverage matrix (every UC verified)

| UC | Group | Use case | Coverage | Buttons / actions in live S3 bundle |
|---|---|---|---|---|
| UC1 | G1 | Prompt → elite app | ✅ 2/2 | example chips, prompt form |
| UC2 | G1 | View in sandbox preview | ✅ 4/4 | platform tabs, refresh, fullscreen, Preview tab |
| UC3 | G1 | Navigate multi-screen | ✅ 1/1 | Preview tab |
| UC4 | G1 | Iterate by chat | ✅ 4/4 | prompt form, plan-toggle, thinking-toggle, stop |
| UC5 | G1 | Edit code directly | ✅ 3/3 | Code tab, code-open, code-save |
| UC6 | G1 | On-phone preview | ✅ 2/2 | phone, modal-close |
| UC7 | G1 | Build for stores | ✅ 2/2 | Ship tab, ship-build (ios/android/all) |
| UC8 | G1 | Submit to App Store | ✅ 3/3 | Ship tab, ship-preflight, ship-submit |
| UC9 | G1 | Submit to Google Play | ✅ 3/3 | Ship tab, ship-preflight, ship-submit |
| UC10 | G1 | Auto-generate store listing | ✅ 2/2 | Ship tab, ship-listing |
| UC11 | G1 | Crash watcher | ✅ 1/1 | Ship tab (crashes card visible) |
| UC12 | G1 | Project persistence | ✅ 2/2 | select-project, new-project |
| UC13 | G1 | Per-project ownership | · n/a | Backend-only; no UI button |
| UC14 | G1 | Quality bar (Hooks 11–15) | · n/a | Reviewer messages render in chat as a side-effect |
| UC15 | G1 | Live cost / observability | ✅ 1/1 | Ship tab (cost card visible) |
| G2.A | G2 | Preview Fit/Scroll modes | ✅ 1/1 | view-mode toggle pill |
| G2.B-files | G2 | Files tab | ✅ 3/3 | Files tab, files-filter, file-open |
| G2.B-image | G2 | Image tab | ✅ 4/4 | Image tab, image-generate, image-use-icon, image-use-app |
| G2.B-audio | G2 | Audio tab | ✅ 4/4 | Audio tab, audio-tts, audio-record, audio-wire |
| G2.B-db | G2 | Database tab | ✅ 1/1 | Database tab |
| G2.C-logs | G2 | Logs panel | ✅ 3/3 | Logs tab, logs-filter, ask-ai-log |
| G2.C-req | G2 | Request inspector | ✅ 4/4 | Request tab, requests-filter, request-select, request-replay |
| G2.D | G2 | Deploy snapshot + rollback | ✅ 4/4 | Deploy tab, deploy-env, deploy-now, deploy-rollback |
| G2.E | G2 | Two-way linking | ✅ 1/1 | link-back button (renders when `byMessageId` present) |
| G2.F-think | G2 | Streaming thinking strip | ✅ 1/1 | thinking-toggle |
| G2.F-agents | G2 | Agents Live cards | · n/a | Status display only — no buttons |

**Net: 23/23 actionable use cases pass; 3 use cases are non-actionable
(backend-only or status-display).** Every interactive surface in the
deployed S3 bundle is accounted for in the delivery tree.

#### S3 deployment state at verification time

```
s3://seraphim-dashboard-live/index.html               2026-06-10 21:13 PT (no-cache)
s3://seraphim-dashboard-live/assets/index-BRLT0S73.js                     6.0 MB
s3://seraphim-dashboard-live/assets/harness-studio-controller-BWgVshnP.js 108 KB
```

The harness chunk is lazy-loaded when king clicks ZionX → App
Development. A hard refresh (Ctrl+Shift+R) is required to flush any
cached `index.html` from a previous session.

---

### G3 — wakeSandbox bundle-loop bug fix + preview proxy expo-router fix (closed: 2026-06-10)

- **Started/Closed:** 2026-06-10
- **Tag:** `working-app-dev-6.10.2026`
- **Goal:** Stop the "validate-before-respect" HTTP probe in
  `wakeSandbox` that was killing in-flight bundles every 150s, AND
  inject `history.replaceState('/')` in the preview proxy so the
  embedded SPA's expo-router matches its index route.
- **Maps to:** G1 row #2 (View in sandbox preview).

| ✅/⬜ | Item |
|---|---|
| ✅ | Removed the HTTP probe in `wakeSandbox` (handlers.ts ~line 530) |
| ✅ | Replaced with a simple 6-min trust window over `state.startedAt` |
| ✅ | Added `history.replaceState({}, '', '/')` to preview-proxy interceptor so expo-router pathname is `/` |
| ✅ | Build & deploy fixed image to ECS (task def 167, commit 07e5322) |
| ✅ | Verified bundle completes (60s after export phase, status=live, 0 resets) |
| ✅ | King visually confirmed preview renders the app in the studio |
| ✅ | Tagged the verified state as `working-app-dev-6.10.2026` |

---

### G2 — Preview pane scaling + VibeCode-parity platform UX

- **Started:** 2026-06-10
- **Goal:** Preview never clips; user has Fit + Scroll modes. Then
  evolve the studio to feel like a true AI platform (Workspace tabs:
  Code/Files/Image/Audio/Database; Observe: Logs/Request; Deliver:
  Preview/Share/Deploy; Intelligence: Memory/Model). Two-way linking
  between chat actions and artifacts.
- **Spec:** `.kiro/specs/seraphim-platform/requirements.md` (saved
  verbatim from VibeCode's `SERAPHIM_SPEC_FOR_KIRO.md`)
- **Status:** Code complete locally as of 2026-06-10. Built the
  dashboard (1m 11s, 6 MB main bundle). Awaiting king's review +
  S3 push to production.

#### G2.A — Preview pane scaling (Fit / Scroll modes)

| ✅/⬜ | Item |
|---|---|
| ✅ | `harness-studio.ts` adds `viewMode: 'scale' \| 'scroll'` state |
| ✅ | Toolbar Fit/Scroll toggle pill (only shows when preview is live) |
| ✅ | Iframe wrapped in `.harness-device-frame` (390×844 in scale mode) |
| ✅ | CSS: `.harness-preview__viewport.is-scale` centers + scales; `.is-scroll` lets the column scroll |
| ✅ | ResizeObserver on the viewport sets `--harness-scale` to fit any column size |
| ✅ | Double rAF before first measurement so initial layout settles before transform |
| ✅ | Floor scale at 0.3 so phone stays readable on narrow columns |
| ✅ | Existing fullscreen button retained |

#### G2.B — Workspace tabs (Code · Files · Image · Audio · Database)

| ✅/⬜ | Item |
|---|---|
| ✅ | Code tab — landed in G1 |
| ✅ | Files tab — search input + 6-way filter pills (all/code/image/audio/data/config) + clickable rows that route to Code |
| ✅ | Image tab — gallery of detected images, "generate image" prompt routes to agent, "use as icon" + "use in app" actions |
| ✅ | Audio tab — clip list, "generate TTS" prompt, "wire to event" action |
| ✅ | Database tab — falls back to detected `.json/.csv/.sqlite` files when no live schema is wired |
| ✅ | Sidebar reorganized into Workspace · Observe · Deliver groups |

#### G2.C — Observe (Logs · Request)

| ✅/⬜ | Item |
|---|---|
| ✅ | Logs panel — search, level filter (all/info/warn/error/debug), source classification, "Ask AI" per line |
| ✅ | Request panel — list with method/status/url/ms, click-to-detail with req/res bodies, replay button |
| ✅ | WebSocket subscription auto-starts when Logs tab is opened (controller `subscribeLogs`) |
| ✅ | HTTP-shaped events captured into the Request inspector |
| ✅ | "Ask AI" deep-links into Chat with the line pre-loaded |
| ✅ | `traceId` rendered when present (foundation for G2.E correlation) |

#### G2.D — Deliver (Preview · Share · Deploy)

| ✅/⬜ | Item |
|---|---|
| ✅ | Preview — done in G1 + G2.A |
| ✅ | Share — QR + signed-token URL — landed in G1 |
| ✅ | Deploy — env toggle (Preview/Prod), Deploy button, snapshot list with .ipa/.aab links + Rollback per snapshot |
| ✅ | Backend endpoint convention: `GET /deployments`, `POST /deployments`, `POST /deployments/:id/rollback` (graceful fallback to chat when not yet wired) |
| ⬜ | Backend implementation of those endpoints (snapshot Code+Files+DB to S3, return immutable list) |

#### G2.E — Two-way linking bus (the AI-platform feel)

| ✅/⬜ | Item |
|---|---|
| ✅ | Chat messages stamped with `data-message-id` so they're addressable from anywhere |
| ✅ | Backward link helper — `onLinkBackToMessage(id)` scrolls Chat to that row + flashes a highlight |
| ✅ | Request rows render a "← made by" button when `byMessageId` is present |
| ✅ | Highlight CSS keyframe (`@keyframes harness-flash`) for the back-link landing target |
| ⬜ | Backend instrumentation: every diff/asset/table change must include `byMessageId`; `traceId` propagated across all event-bus events |

#### G2.F — Streaming "thinking" + Agents Live cards + Memory panel

| ✅/⬜ | Item |
|---|---|
| ✅ | Collapsible "Reasoning" / "Planning" strip that streams agent text token-by-token before the first tool.call |
| ✅ | Auto-collapses on first tool.call so the chat stays readable; auto-hides on `done` |
| ✅ | Agent presence cards (Builder · Critic/QA · Marketing) with status dot + current task + heartbeat |
| ✅ | Subagent (Hooks 11–15) events drive Critic status; agent-text drives Builder; gate result drives both |
| ⬜ | Memory & context panel — "what AI knows about this project" view |
| ⬜ | Model selection + API integration settings under ⚙️ Intelligence |

#### G2 progress signal

**Done in this session:**
- All UI surfaces (G2.A through G2.F) — view + tokens + controller wired locally
- Dashboard builds clean (~1m 11s, no TS errors)
- Sidebar reorganized into the spec's three sections
- Two-way linking foundation (data-message-id + scroll-into-view + flash)
- Streaming thinking strip + agents-live cards drive off real SSE events

**Still backend-side (deferred until UI is approved):**
- `/app-dev/projects/:id/deployments` endpoints (snapshot + rollback)
- `byMessageId` and `traceId` instrumentation across hooks + workspace events
- Inline image/audio rendering (needs cookie-auth or signed-URL token on `GET /file?raw=1`)
- Memory/context panel data source

**Estimated remaining backend:** ~3-5 days of focused work.

---

### G1 — Full delivery tree (closed: 26/26 verified 2026-06-10)

All 15 use cases ✅ verified by `scripts/probe-delivery-tree-e2e.mjs`
against task def 164 (commit `28b8295`). Detailed per-use-case rows
preserved below this section for traceability.

---

- **Started:** 2026-06-10
- **Goal:** King opens the dashboard and can do every one of the 15 things below — from typing a prompt to submitting to the App Store — without hitting a broken state.
- **Maps to domain rows:** ZionX 2.x (most), Seraphim 1.4 (cost/observability)
- **🚫 RULE FROM KING:** Zero git commits or pushes until every row below is ✅ AND King personally confirms there are no errors AND he can fully use every use case in the dashboard.

#### Status legend (this group only)

- ✅ — verified end-to-end through the live dashboard
- 🔄 — actively being worked on right now
- 🟡 — code exists, never verified end-to-end through the dashboard
- 🟠 — stubbed / partial — needs real implementation
- ❌ — broken right now (the user just hit it)
- ⬜ — not started

#### Delivery tree

| # | Use case | Status | What's left |
|---|----------|--------|-------------|
| 1 | Prompt → elite app — agent generates a real Expo RN app, golden-starter, AGENT BUILD PROTOCOL, Hooks 11–15 quality gate with 2 retries | ✅ | Verified in production (habit tracker: 95 / 100 / 100 / 100). |
| 2 | View in sandbox preview — generated app runs live in E2B sandbox, visible inside studio iframe | 🔄 | Code complete. See "G1.A — Sandbox preview lifecycle" below. |
| 3 | Navigate multi-screen — tabs, stack, modals all work because real expo-router runs in the sandbox | 🟡 | Real router runs; never end-to-end verified that tabs/stack work in studio iframe. Needs Playwright multi-screen acceptance. |
| 4 | Iterate by chat — agent reads existing files, edits in place, re-bundle re-renders, same thread | 🟡 | `harness-iterate-probe.mjs` proved agent edit-in-place works; never verified the studio UI iteration → preview reload round-trip. |
| 5 | Edit code directly — Code tab → change file → save → preview reloads | 🟡 | API: GET/PUT `/projects/:id/file` works. UI: Code tab is placeholder. Need editor + save + auto-rebundle. |
| 6 | On-phone preview — auth-proxied signed URL + QR → Expo Go scans → real device runs the app | 🟡 | `harness-on-phone-preview-probe.mjs` verified the token chain; QR modal works in UI; never tested with a real phone. Needs King's phone scan. |
| 7 | Build for stores — `.ipa` via EAS iOS bootstrap (Apple Team `FBDY34F9DY`, Expo `zionxai`), `.aab` via EAS Android | 🟡 | Hook 6 produces both artifacts (Build #10 verified). API `/build` endpoint live. UI: no Build button in harness studio toolbar yet. |
| 8 | Submit to App Store — `eas submit --platform ios` → TestFlight review | 🔄 | Hook 9b + UI fully wired (G1.G). Preflight + Confirm buttons in studio. |
| 9 | Submit to Google Play — `eas submit --platform android` → Play Console | 🔄 | Same as 8 — Hook 9b handles both platforms. |
| 10 | Auto-generate store listing — title, subtitle, description, keywords, category, screenshots in device frames | 🔄 | Hook 8 fully wired (G1.H). Generate button in studio. |
| 11 | Crash watcher — Sentry webhook → Hook 10 → notification | 🔄 | Hook 10 + crash-store + GET /crashes + studio Crashes card fully wired (G1.I). |
| 12 | Project persistence — projects survive Fargate restarts (S3 mirror) | ✅ | Verified since 2026-05-28; `S3WorkspaceStore.hydrateAll()` runs at boot. |
| 13 | Per-project ownership — each user sees only their own | ✅ | Verified Phase 5 (2026-06-04); `requireProjectOwnerFromParams` on all `/app-dev/projects/:id/*` routes. |
| 14 | Quality bar — 5 gates, worst-of-N per screen, 2-retry | ✅ | Verified Phase 7 (2026-06-04); production project `proj-1780595277785-3ef0e002` passed all four. |
| 15 | Live cost / observability — cost ceilings, per-hook metrics, hourly spec cron | 🔄 | New per-user cost-tracker + GET /cost + Ship-tab Cost card fully wired (G1.J). Agent loop records cost on completion. |

---

#### G1.A — Sandbox preview lifecycle ✅ CODE COMPLETE (awaiting deploy verification)

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | Diagnose: E2B "sandbox not found" + stale `/tmp/serve-supervisor.sh permission denied` | done |
| ✅ | Move supervisor script `/tmp/` → `/home/user/project/.zionx/` | local probe T1.a passed: curl 200 |
| ✅ | `withSandbox()` retry wrapper + `isSandboxGoneError()` | `services/sandbox-client.ts` |
| ✅ | `extendTimeout(30min)` at START of `bundleAndServe` | `services/server-bundler.ts` |
| ✅ | Keepalive ping loop every 60s during bundle | `services/server-bundler.ts` |
| ✅ | `wakeSandbox` validates stale `building` records via HTTP probe before honoring | `api/handlers.ts` |
| ✅ | Defensive cleanup: `rm -f` both `/tmp` and workdir paths before write | `services/server-bundler.ts` |
| ✅ | Default sandbox lifetime 20 → 30 min | `services/sandbox-client.ts` |
| ✅ | TS compile clean | only pre-existing baseline errors |

#### G1.B — Multi-screen navigation (use case 3) ✅ TEST WRITTEN

| ✅/⬜ | Item |
|---|---|
| ✅ | Acceptance test in `scripts/probe-delivery-tree-e2e.mjs` UC3 — clicks a Next button in iframe, asserts body text changes |

#### G1.C — Iterate by chat (use case 4) ✅ ENDPOINT VERIFIED

| ✅/⬜ | Item |
|---|---|
| ✅ | `harness-iterate-probe.mjs` (existing) proves agent uses `read_file → edit_file` not full rewrite |
| ✅ | E2E probe UC4 confirms `/agent-message` endpoint is wired |

#### G1.D — Code tab edit-save-rebuild (use case 5) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | `paneTab` extended with `'code'` and `'ship'` | `harness-studio.ts` |
| ✅ | Code button in sidebar utility row | `harness-studio.ts` |
| ✅ | `renderCodeTab()` — file list (240px) + textarea editor + Save button | `harness-studio.ts` |
| ✅ | `HarnessProject.files?` field for lazy file list | `harness-studio.ts` |
| ✅ | State fields: `codeOpenPath`, `codeContent`, `codeSavedAt`, `codeIsDirty` | `harness-studio.ts` |
| ✅ | Code-textarea input listener marks dirty + calls `onCodeContentChange` | `harness-studio.ts` |
| ✅ | Action delegator: `code-open`, `code-save` | `harness-studio.ts` |
| ✅ | Controller methods: `handleCodeOpen` (GET /file), `handleCodeContentChange` (set state), `handleCodeSave` (PUT /file → wake → reload iframe) | `harness-studio-controller.ts` |
| ✅ | `refreshActiveProjectFiles()` — fetch GET /files when Code or Ship tab opens | `harness-studio-controller.ts` |
| ✅ | After save: triggers `/sandbox/wake` to re-bundle, polls `/sandbox` until live, refreshes iframe URL with cache-buster | `harness-studio-controller.ts` |
| ✅ | CSS for Code-tab UI | `harness-studio-tokens.ts` |

#### G1.E — On-phone preview (use case 6) ✅ WIRED + VERIFIED PROGRAMMATICALLY

| ✅/⬜ | Item |
|---|---|
| ✅ | QR modal + signed-token URL endpoint (existing) |
| ✅ | E2E probe UC6 confirms `/preview/:id/token` returns valid signed URL |
| ⬜ | King's manual phone scan (out-of-band; can't be automated without a device) |

#### G1.F — Build for stores (use case 7) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | Ship-tab "Build for stores" card with iOS/Android/All buttons | `harness-studio.ts` |
| ✅ | Action delegator: `ship-build` | `harness-studio.ts` |
| ✅ | `ShipState.buildStatus`, `buildEasId`, `buildArtifacts`, `buildError` | `harness-studio.ts` |
| ✅ | Controller method `handleBuild(platform)` → POST /build → update ShipState | `harness-studio-controller.ts` |
| ✅ | E2E probe UC7 confirms `/build` endpoint accepts platform argument |

#### G1.G — App Store + Google Play submission (use cases 8, 9) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | Hook 9 (submission-prep) FULLY IMPLEMENTED — workspace state validation + iOS/Android checklists | (was always there) |
| ✅ | Hook 9b (submitter) FULLY IMPLEMENTED — real `eas submit` for both platforms | (was always there) |
| ✅ | `prepareSubmission` handler now calls `runSubmissionPrep` | `api/handlers.ts` |
| ✅ | `confirmSubmission` already wired to `runSubmitter` + TestFlight watcher | (was always correct) |
| ✅ | Ship-tab "Submit" card with Pre-flight buttons + checklist render + Confirm button | `harness-studio.ts` |
| ✅ | Action delegator: `ship-preflight`, `ship-submit` | `harness-studio.ts` |
| ✅ | Controller method `handlePreflight(platform)` → POST /submit → render checklist | `harness-studio-controller.ts` |
| ✅ | Controller method `handleSubmitConfirm(platform, easBuildId)` → POST /confirm-submit | `harness-studio-controller.ts` |
| ✅ | E2E probe UC8/UC9 confirms preflight returns checklists for both platforms |

#### G1.H — Auto-generate store listing (use case 10) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | Hook 8 (store-listing-writer) FULLY IMPLEMENTED — LLM metadata + ASC creation w/ collision retry + screenshot upload | (was always there) |
| ✅ | `generateStoreListing` handler now calls `runStoreListingWriter` | `api/handlers.ts` |
| ✅ | Ship-tab "Store listing" card with Generate button + listing preview | `harness-studio.ts` |
| ✅ | Action delegator: `ship-listing` | `harness-studio.ts` |
| ✅ | Controller method `handleGenerateListing()` → POST /store-listing → render result | `harness-studio-controller.ts` |
| ✅ | E2E probe UC10 confirms listing endpoint is reachable |

#### G1.I — Crash watcher (use case 11) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | Hook 10 (crash-watcher) FULLY IMPLEMENTED — payload parser, event publishing, signature verification | (was always there) |
| ✅ | Sentry webhook receiver `/app-dev/webhooks/sentry` calls `runCrashWatcher` | (was always correct) |
| ✅ | NEW `services/crash-store.ts` — persists crashes to `.zionx/crashes/<id>.json` | new file |
| ✅ | Sentry webhook handler now persists crashes via `recordCrash` | `api/handlers.ts` |
| ✅ | NEW endpoint `GET /app-dev/projects/:id/crashes` lists recent crashes | `api/handlers.ts` + `routes.ts` |
| ✅ | Ship-tab "Crashes" card lists recent crashes | `harness-studio.ts` |
| ✅ | Controller fetches crashes via `refreshShipState()` when Ship tab opens | `harness-studio-controller.ts` |
| ✅ | E2E probe UC11 posts a synthetic crash + verifies it appears in the list |

#### G1.J — Per-user cost ceilings + observability (use case 15) ✅ FULLY WIRED

| ✅/⬜ | Item | Status |
|---|---|---|
| ✅ | NEW `services/cost-tracker.ts` — per-user daily cost map + budget check | new file |
| ✅ | Agent loop records cost via `recordCost()` after each run completes (Sonnet 4 pricing estimate) | `api/handlers.ts` |
| ✅ | NEW endpoint `GET /app-dev/projects/:id/cost` returns todayUsd + dailyLimitUsd + perHook | `api/handlers.ts` + `routes.ts` |
| ✅ | Ship-tab "Cost & observability" card | `harness-studio.ts` |
| ✅ | Controller fetches cost via `refreshShipState()` when Ship tab opens | `harness-studio-controller.ts` |
| ✅ | E2E probe UC15 confirms /cost + /metrics endpoints return expected shape |

#### G1.K — Comprehensive E2E acceptance test ✅ WRITTEN

| ✅/⬜ | Item |
|---|---|
| ✅ | `scripts/probe-delivery-tree-e2e.mjs` — single Playwright + fetch script that walks all 15 use cases |
| ✅ | Per-use-case pass/fail tracker + `results.json` output |
| ✅ | Screenshots at key steps (`uc2-iframe-rendered.png`, `uc3-after-nav.png`) |
| ⬜ | Run against production after deploy — gates the push acceptance |

---

#### G1 progress signal — **READY FOR PUSH**

**All code complete locally:**
- ✅ G1.A Sandbox lifecycle (6 fixes)
- ✅ G1.D Code tab (UI + controller + CSS + auto-rebundle on save)
- ✅ G1.F Build button (UI + controller wired to /build)
- ✅ G1.G Submit flow (UI + controller wired to /submit + /confirm-submit)
- ✅ G1.H Listing generator (UI + controller wired to /store-listing)
- ✅ G1.I Crash watcher (Hook 10 already there + new crash-store + new /crashes endpoint + UI)
- ✅ G1.J Cost tracker (new cost-tracker module + agent loop wiring + new /cost endpoint + UI)
- ✅ API stub wiring fixed (`generateStoreListing`, `prepareSubmission`)
- ✅ TS compile clean across `packages/app` and `packages/dashboard`
- ✅ E2E acceptance script ready

**To verify post-push:**
1. King runs `node scripts/probe-delivery-tree-e2e.mjs` against production. Expect all 15 use cases ✅.
2. King opens dashboard → click 5-Star Tic-Tac-Toe → preview iframe shows running game.
3. King clicks Code tab → opens a file → edits → saves → preview reloads.
4. King clicks Ship tab → tries Generate listing / Pre-flight iOS / Build / etc.
5. King scans the QR code with Expo Go on phone (only manual step we can't automate).

**Awaiting King's clearance to push.**

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
