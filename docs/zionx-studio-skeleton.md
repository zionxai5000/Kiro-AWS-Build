# ZionX Studio — Skeleton Reference

> Visual + structural reference for what the App Development tab is and what
> it's becoming. Pairs with `zionx-studio-spec.md` (the contract) and
> `research/vibecode-functionality-audit.md` (the source material).
>
> Updated: 2026-05-28

---

## 1. The shell — four columns, persistent

```
┌────────────────┬────────────────────────────┬───────────────────┬─────────────┐
│ PROJECT LIST   │ CENTER PANE (5 tabs)       │ PREVIEW           │ TOOLS RAIL  │
│                │                            │                   │             │
│ + New Project  │ ┌───────────────────────┐  │ ┌──┐ device frame │ Build iOS   │
│                │ │💬 Chat │ 📁 Files │…  │  │ │  │              │ Build       │
│ ▸ proj-1 (5f)  │ └───────────────────────┘  │ │  │              │  Android    │
│   proj-2 (12f) │                            │ │  │              │             │
│   proj-3 (3f)  │ Active tab content         │ │  │              │ ─────       │
│                │ scrolls inside this column │ │  │              │ Deploy →    │
│                │                            │ │  │              │  TestFlight │
│ ─────          │                            │ │  │              │ Deploy →    │
│ 🟢 healthy     │                            │ └──┘              │  Play       │
│ 15/15 hooks    │                            │ Refresh / Retry   │             │
│ persist: ✓     │                            │                   │ ⚠ 0 stuck   │
└────────────────┴────────────────────────────┴───────────────────┴─────────────┘
```

### Column responsibilities

| Column | What it does | What it MUST persist |
|--------|--------------|----------------------|
| Sidebar | Lists projects, "+ New", health indicator | Project list survives refresh (Stream A: S3 mirror) |
| Center | Tab-switched workbench: Chat / Files / Code / Logs / Design | Open tab + open file path in localStorage |
| Preview | Live rendered app (Snack iframe), or empty state, or build/error | Latest snackId on the project so refresh re-uses it |
| Tools rail | Build / Deploy buttons, KPI badges | Latest build ID for re-enabling Deploy after refresh |

---

## 2. Tab anatomy (center pane)

### 💬 Chat (default)
- Message thread (user / assistant / system bubbles)
- **Live narration line** during generation: shows the current pipeline phase verbatim ("Streaming code from Claude…", "Validating dependencies…")
- Inline **design picker** appears as an assistant message when user hits the Design tab — branding cards renderable inside chat without leaving the conversation
- Input row: textarea + Send button. Disabled during stream. ⌘+Enter sends.

### 📁 Files
- Vertical file tree, sorted alphabetically
- Each file row: 📄 icon, path, status (⏳ streaming / 📄 complete)
- Click a file → opens it in Code tab with the same path highlighted

### 💻 Code
- Monaco editor (full TypeScript / TSX / JSON syntax)
- Header: file path · "unsaved" indicator if dirty
- Save button (⌘S keybinding), Revert button
- Save fires secret-scan; warnings echo into chat

### 📋 Logs
- Append-only stream of build / SSE / WebSocket events
- Latest 100 events; auto-scroll to bottom unless user scrolled up
- **Spec violations land here** — when the runner flags something, "[spec] VIOLATION: rule-id — message" appears as a log line

### 🎨 Design
- Branding category filter (calm / focus / vital / modern)
- Grid of branding cards (gradient swatch + name + inspiration)
- Click a card → assistant message in chat with palette tokens, send fires an iteration prompt

---

## 3. The 22-button skeleton (one row = one click)

| # | Button | Where | Acceptance breadcrumb |
|---|--------|-------|----------------------|
| 1 | **+ New** | Sidebar header | `studio.newProject` |
| 2 | Project entry | Sidebar list | `studio.loadProject` → `studio.projectLoaded` |
| 3 | **Send** | Chat input | `studio.send` → `studio.streamStart` → `studio.streamDone | streamError` |
| 4–8 | Tab Chat/Files/Code/Logs/Design | Center top | `studio.tab` (one per click) |
| 9 | File row | Files tab | `studio.openFile` → `studio.fileLoaded` |
| 10 | **Save** | Code tab | `studio.saveFile` → `studio.fileSaved | saveError` |
| 11 | **Build iOS** | Tools rail | `studio.build platform=ios` → `studio.buildQueued | buildError` |
| 12 | **Build Android** | Tools rail | `studio.build platform=android` |
| 13 | **Deploy TestFlight** | Tools rail | `studio.deploy platform=ios` → `studio.deployStarted | deployError` |
| 14 | Deploy Play | Tools rail | `studio.deploy platform=android` |
| 15 | Branding card | Chat (design picker) | `studio.applyBrandingStyle` |
| 16 | Retry preview | Preview error overlay | `studio.buildPreview` → `studio.previewReady | previewError` |
| 17 | Build preview | Preview idle state | same as #16 |
| 18 | Refresh sidebar | Sidebar header | `studio.refresh` → `studio.projectsRefreshed` |
| 19 | Health badge | Sidebar footer | hover → tooltip |
| 20 | Escalations badge | Tools rail bottom | `studio.openEscalations` |
| 21 | Cancel generation | Chat input (during stream) | `studio.abortGeneration` → `studio.streamAborted` |
| 22 | (lifecycle) Unmount | Browser navigation | (no breadcrumb required) |

Every button gets a structured Sentry breadcrumb. The runner verifies that
each "started" breadcrumb pairs with its corresponding "resolved / errored"
breadcrumb within the spec's time budget.

---

## 4. Lifecycle frames (what shows when)

### Empty (no project)
```
┌─────────────┐
│   📱        │
│   Your app  │
│   preview   │
│             │
│  Send a     │
│  prompt to  │
│  start      │
└─────────────┘
```
Sidebar shows projects (or empty placeholder). Chat shows welcome message + sample prompts.

### Generating (stream open)
```
┌─────────────┐
│   ⚡        │
│  Building   │
│  your app   │
│             │
│  ▓▓▓▓▓░░░░░ │  ← live progress
│             │
│  3 files ·  │  ← file count ticks up
│  4,829 tk   │
└─────────────┘
```
Chat shows live narration line. Files tab fills in real time. Code tab shows "Pick a file from Files".

### Preview building (after `done` event)
```
┌─────────────┐
│   🪄        │
│  Bundling   │
│  preview…   │
│             │
│  ▓▓▓░░░░░░  │  ← shimmer
│             │
│  Sending    │
│  to Snack   │
└─────────────┘
```

### Preview ready
```
┌─────────────┐
│ [Snack       │
│  iframe with │
│  the actual  │
│  app render] │
│              │
│  full app    │
│  interactive │
└─────────────┘
```
Tools rail enables Build buttons. Status badge shows "Preview: ready".

### Preview error
```
┌─────────────┐
│   ⚠         │
│  Preview    │
│  unavailable│
│             │
│  [error msg]│
│             │
│  ↻ Retry    │
│  📱 Build   │
└─────────────┘
```
Chat shows error message with hint. Sentry receives `studio.previewError`.

### Build queued / running / built
```
Logs tab activates.
Tools rail shows: [iOS: queued ⏳]  →  [iOS: running ▓▓░]  →  [iOS: ✓ Build #N]
Build success enables Deploy TestFlight button.
```

### Build failed
```
[iOS: ✗ failed]
Chat: "Build failed: <reason>. Click Logs for details."
Escalation badge increments if Sentry-captured.
```

---

## 5. Refresh behavior (the persistence guarantee)

When you reload the page, the app MUST:

1. Fire `studio.session.start` with a fresh `sessionId`
2. Call `GET /api/app-dev/projects` — sidebar populates
3. Read `localStorage.zionx_studio_project_id`; if set and exists in list, load it
4. Call `GET /api/app-dev/projects/:id/files` — file tree populates
5. Last open file (from localStorage) re-opens in Code tab if it still exists
6. Last `previewUrl` re-injects the Snack iframe (fast path; rebuild if it's stale)
7. Call `POST /api/app-dev/spec/evaluate` in background — surface violations in Logs

If S3 hydrate ran 20 seconds ago, NONE of the projects should be missing.
That's the persistence test. Stream A (durable S3 mirror) makes this true.

---

## 6. The compliance overlay

A small status pill in the sidebar footer (planned for Stream F follow-up):

```
┌──────────────────────────┐
│ ✓ Spec OK · 16 rules     │   ← all-clear after evaluate
└──────────────────────────┘
```

```
┌──────────────────────────┐
│ ⚠ 2 spec violations →    │   ← clickable; opens Logs
└──────────────────────────┘
```

Click → Logs tab, scrolled to the violation lines. Each line shows:
```
[spec] VIOLATION: send-creates-or-streams — Send button must create
        a project (if none) and start a generate stream
        actual next: studio.openFile
```

---

## 7. What's currently in the codebase vs what's still pending

### ✅ Already shipped (this session, deployed, verified live)
- The four-column shell (`packages/dashboard/src/views/studio.ts:render()`)
- Sidebar with project list + "+ New"
- Five-tab center pane: Chat / Files / Code / Logs / Design
- Preview pane with all states (empty, generating, building, ready, error)
- Tools rail buttons: Build iOS, Build Android, Deploy iOS
- Inline design picker in chat (branding cards inside an assistant message)
- Health badge in sidebar footer
- Escalations badge bottom-right
- Live narration during generation
- Real-time file tree streaming (file_start / file_end events)
- Monaco editor with save / revert / ⌘S keybinding
- All 22 buttons fire structured Sentry breadcrumbs
- `studio.session.start` on every mount + `evaluateSpecInBackground()`
- Hourly backend spec compliance cron (verified live: returns OK)
- Persistence: every workspace write mirrors to S3, hydrate on boot

### 🟡 Mostly there but could be polished (Stream F polish backlog)
- Live "compliance pill" in sidebar footer (right now violations only land in Logs + Sentry)
- Per-tab unread/dirty indicator (only Code has the • marker)
- Build status badge in Tools rail (right now status only appears in Logs)
- Cancel-generation button visibility (it exists but only as keyboard escape, not a button)

### ❌ Not yet (deferred, requires more design)
- The compliance pill UI itself (component to be added)
- Pinch-to-build mobile gesture equivalent (this is a desktop dashboard, so not directly applicable)
- Restore / version history (future, post Stream F)

---

## 8. Where each piece lives in code

| Area | File |
|------|------|
| Studio shell + render | `packages/dashboard/src/views/studio.ts` |
| Spec contract (Markdown source of truth) | `docs/zionx-studio-spec.md` |
| Spec runner + rules | `packages/app/src/zionx/app-development/services/spec-runner.ts` |
| Persistence (S3 mirror) | `packages/app/src/zionx/app-development/services/s3-workspace-store.ts` |
| Boot wiring + hourly cron | `packages/services/src/shaar/production-server.ts` |
| API handlers (`/spec`, `/spec/evaluate`) | `packages/app/src/zionx/app-development/api/handlers.ts` |
| Branding tokens | `packages/dashboard/src/data/branding-styles.ts` |
| Device frame component | `packages/dashboard/src/components/studio/DeviceSelector.tsx` |
| Research source material | `docs/research/vibecode-functionality-audit.md` |
