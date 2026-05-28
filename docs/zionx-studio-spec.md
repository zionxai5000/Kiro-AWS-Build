# ZionX Studio — Behavior Spec

**Version**: 1.0.0
**Last updated**: 2026-05-28
**Status**: Living document — every dashboard click must reconcile against it.

This spec is the contract for how the App Development tab of the ZionX
dashboard must behave. It mirrors the user-facing functionality of VibeCode
and Rork (the two best-in-class consumer "describe an app, get a real app"
products) and adapts them to ZionX's backend orchestration pipeline.

When you click anything in the live dashboard, Sentry captures a breadcrumb.
The `spec-runner` service ingests recent Sentry breadcrumbs and reports any
deviation from the rules below.

---

## 1. Layout

Four-column shell, persistent across all states:

```
┌──────────────┬──────────────────────────┬─────────────┬──────────┐
│ Project list │ Center pane (5 tabs)     │ Preview     │ Tools    │
│ (sidebar)    │ Chat / Files / Code /    │ (iframe or  │ rail     │
│              │ Logs / Design            │ device      │ (kpis,   │
│              │                          │ frame)      │ build,   │
│              │                          │             │ deploy)  │
└──────────────┴──────────────────────────┴─────────────┴──────────┘
```

- **Project list**: every workspace this server knows about, ordered by most
  recently updated. Each entry shows name, prompt summary, file count, and
  relative timestamp. Clicking switches the center+preview to that project.
- **Center pane tabs**: Chat (default), Files, Code, Logs, Design.
- **Preview**: a live device frame containing the rendered app. Empty state
  shows "Generate an app to see it here." Building state shows a progress bar
  and the current pipeline phase. Ready state shows the Snack iframe. Error
  state shows the failure with a Retry button.
- **Tools rail**: KPIs (file count, last build status, escalation count), a
  Build iOS button, a Build Android button, and a Deploy to TestFlight
  button (greyed out until a successful build exists).

---

## 2. Screen states

| State | Trigger | Center pane | Preview pane | KPIs |
|-------|---------|-------------|--------------|------|
| Empty | No project loaded | Welcome message + sample prompts | "No app yet" placeholder | All zero |
| Generating | `streamGenerateCode` open | Live narration in chat, file tree filling in real time | "Building preview after generation completes" | File count ticks up |
| Complete | `done` event received | Final summary message in chat | Snack iframe rendering the app | File count, last gen time |
| Error | `error` event received | Error message in chat with retry hint | Last good preview persists | Error badge shown |
| Preview building | `createPreview` in flight | Status message "Building live preview..." | Loading shimmer | "Preview: building" |
| Preview ready | Snack returns `embedUrl` | Status message "Preview is live" | Snack iframe | "Preview: ready" |
| Preview error | Snack returns 4xx/5xx | Error message with Retry | Last good iframe persists, error overlay on top | "Preview: error" |
| Build queued | `startBuild` returns 200 | Logs tab activates with build event | Greyed-out frame | "Build: queued" |
| Build running | EAS poller streams updates | Logs tab fills with phase events | Frame shows "Building... " | "Build: running" |
| Build success | `build.completed` event | Chat: "Build complete — ready to ship" | Frame stays current | "Last build: ✓" |
| Build failed | `build.failed` event | Chat: error + escalation link | Frame stays current | "Last build: ✗" |

---

## 3. Buttons (every click instrumented)

| # | Button | Location | Action | Acceptance |
|---|--------|----------|--------|------------|
| 1 | New project | Sidebar header | Clears project context, focuses prompt input | `studio.newProject` breadcrumb fires; `projectId` in state goes null |
| 2 | Project entry | Sidebar list | Loads project, refreshes file tree | `studio.loadProject` breadcrumb; `GET /app-dev/projects/:id` returns 200 |
| 3 | Send (chat) | Chat input row | Calls `sendPrompt(text)` | `studio.send` breadcrumb; if no project, `POST /app-dev/projects` first; then `POST /app-dev/projects/:id/generate` SSE stream opens |
| 4 | Tab: Chat | Center pane tabs | Show chat thread | `studio.tab` breadcrumb with `tab=chat` |
| 5 | Tab: Files | Center pane tabs | Show file tree | `studio.tab` `tab=files`; tree must reflect current `state.files` |
| 6 | Tab: Code | Center pane tabs | Show Monaco editor | `studio.tab` `tab=code`; if no file open, show "Pick a file from Files" |
| 7 | Tab: Logs | Center pane tabs | Show stream of build/SSE events | `studio.tab` `tab=logs`; latest 50 events visible |
| 8 | Tab: Design | Center pane tabs | Show branding picker, redirected to chat | `studio.tab` `tab=design`; chat receives a `design-picker` message |
| 9 | File entry | Files tab | `openFile(path)` → load + switch to Code tab | `studio.openFile` breadcrumb; `GET /app-dev/projects/:id/file?path=` returns 200 |
| 10 | Save (Code tab) | Code tab toolbar | `saveOpenFile()` | `studio.saveFile` breadcrumb; `PUT /app-dev/projects/:id/file?path=` returns 200; secret-scan warnings echoed in chat |
| 11 | Build iOS | Tools rail | `startBuildFor('ios')` | `studio.build` breadcrumb `platform=ios`; `POST /app-dev/projects/:id/build` returns 200 with `buildId` |
| 12 | Build Android | Tools rail | `startBuildFor('android')` | `studio.build` `platform=android`; `POST /app-dev/projects/:id/build` returns 200 |
| 13 | Deploy TestFlight | Tools rail | `deployFor('ios')` | `studio.deploy` `platform=ios`; only enabled if `latestBuildId` is set; `POST /auto-submit-and-watch` returns 200 |
| 14 | Deploy Play | Tools rail | `deployFor('android')` | Same shape, `platform=android` |
| 15 | Branding card | Design picker (in-chat) | Sets brand, sends iteration prompt | `studio.applyBrandingStyle` breadcrumb with `styleId` |
| 16 | Retry preview | Preview pane (error overlay) | `buildLivePreview()` | `studio.buildPreview` breadcrumb; `POST /app-dev/projects/:id/preview` returns 200 |
| 17 | Build preview | Preview pane (idle) | `buildLivePreview()` | Same as Retry |
| 18 | Refresh project list | Sidebar header | `refreshProjectList()` | `studio.refresh` breadcrumb; `GET /app-dev/projects` returns 200 |
| 19 | Health badge | Tools rail | Tooltip with watcher + error rate | Tooltip from cached `/app-dev/health` |
| 20 | Escalations badge | Tools rail | Drawer with open escalations | `studio.openEscalations` breadcrumb |
| 21 | Cancel generation | Chat input (during stream) | `currentStream.abort()` | `studio.abortGeneration` breadcrumb; SSE closes |
| 22 | Disconnect WS | (lifecycle) | `unmount()` cleans up | No breadcrumb required |

---

## 4. Backend contracts

The dashboard ONLY uses these endpoints. Anything else is a bug.

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/app-dev/projects` | — | `{ count, projects: [{ projectId, name?, prompt?, fileCount, createdAt, updatedAt }] }` |
| POST | `/app-dev/projects` | `{ name, description, platform }` | `{ projectId, name, ... status:'idle' }` |
| GET | `/app-dev/projects/:id` | — | `{ projectId, ... }` |
| GET | `/app-dev/projects/:id/files` | — | `{ projectId, files: string[], count }` |
| GET | `/app-dev/projects/:id/file?path=` | — | `{ projectId, path, content }` |
| PUT | `/app-dev/projects/:id/file?path=` | `{ content }` | `{ projectId, path, bytesWritten, warnings }` |
| POST | `/app-dev/projects/:id/generate` | `{ prompt }` | SSE stream of `{ type, ... }` events |
| POST | `/app-dev/projects/:id/preview` | — | `{ projectId, snackId, url, embedUrl, fileCount }` |
| POST | `/app-dev/projects/:id/build` | `{ platform, autoSubmit? }` | `{ buildId, status, message }` (requires human-origin auth) |
| POST | `/app-dev/projects/:id/auto-submit-and-watch` | `{ platform, easBuildId, androidTrack? }` | `{ status, watcher, message }` |
| GET | `/app-dev/health` | — | `{ status, hooks:{ total, enabled, killSwitchOn }, watcher:{ healthy }, persistence:{ durable }, recentErrorRate, checkedAt }` |
| GET | `/app-dev/metrics` | — | `{ hooks: HookMetric[], recentErrorRate, collectedAt }` |
| GET | `/app-dev/escalations?status=` | — | `{ count, escalations: Escalation[] }` |
| GET | `/app-dev/spec` | — | `{ version, content, lastModified }` (Phase B addition — serves THIS file) |

---

## 5. SSE event taxonomy (`/generate` stream)

| Event type | Payload | When | UI handler |
|------------|---------|------|------------|
| `phase` | `{ phase, message, timestamp, ... }` | Pipeline stage transitions | Append to live narration line in chat |
| `token` | `{ content }` | LLM streams a chunk | Increment `tokensReceived`, do NOT render verbatim |
| `file_start` | `{ path }` | File begins streaming | Add `{ path, status:'streaming' }` to file tree |
| `file_end` | `{ path }` | File complete | Mark `{ path, status:'complete' }`; re-render Files tab |
| `done` | `{ files: string[] }` | Generation complete | Replace live message with summary; trigger `buildLivePreview` |
| `error` | `{ message }` | Hard failure | Replace live message with error; do NOT trigger preview |
| `dry_run` | `{ wouldGenerateFor, promptLength, ... }` | Hook in dry-run mode | Show "Generation skipped (dry-run mode)" message |

Rule: every event MUST close the stream by `done` or `error`. The dashboard
must never see two `done` events for the same generation.

---

## 6. Project lifecycle

```
[empty]
  ↓ user types prompt + Send
[creating]
  ↓ POST /projects → projectId
  ↓ POST /projects/:id/generate → SSE
[generating]
  ↓ phase events stream
  ↓ file_start / file_end events stream
  ↓ done event
[generated]
  ↓ POST /projects/:id/preview
[preview-ready]
  ↓ user iterates via chat OR
  ↓ user hits Build iOS
[building]
  ↓ POST /projects/:id/build
  ↓ EAS poller events
[built]
  ↓ user hits Deploy TestFlight
[submitted]
  ↓ TestFlight watcher polls Apple
[testflight]
```

At every transition, persistence MUST hold:
- Workspace files exist on local disk (Fargate task) AND mirrored to S3.
- `.meta/project.json` exists with `{ name, prompt, description, updatedAt }`.
- Refreshing the dashboard returns to the same project state (no data loss).

---

## 7. Persistence guarantees

| Surface | Storage | Survives task restart? |
|---------|---------|------------------------|
| Workspace files | Fargate ephemeral disk + mirror to S3 | YES — `S3WorkspaceStore.hydrateAll()` restores at boot |
| Project metadata (`.meta/project.json`) | Same as workspace files | YES |
| Escalations | Aurora PostgreSQL (or in-memory fallback) | YES if Aurora; NO if fallback |
| Hook metrics | In-memory | NO — resets on restart (acceptable for now) |
| WebSocket subscriptions | In-memory per connection | NO — clients reconnect |
| Build artifacts (.aab/.ipa) | S3 `app-dev/<projectId>/builds/` | YES |

Cold-restart behavior: `production-server.ts` boots, `S3WorkspaceStore.hydrateAll(WORKSPACE_ROOT)` walks the `workspaces/` prefix, restores every file to local disk before the file watcher starts.

---

## 8. Acceptance criteria for "the dashboard works"

A user can:
1. Land on the App Development tab and immediately see all their previous projects in the sidebar.
2. Click a project → file tree populates within 500ms.
3. Type a prompt → see streaming narration AND the file tree filling live (NOT a static "generating..." message).
4. Watch the preview pane render their app within 30 seconds of `done` event.
5. Click any file → see real source in Monaco within 200ms.
6. Edit a file, hit Save → see "Saved (N bytes)" message and any secret-scan warnings.
7. Hit Build iOS → receive a build ID and watch logs stream in.
8. After build success, hit Deploy TestFlight → receive a submission ID.
9. Refresh the page → land on the same project, with the same files, same preview, same logs.
10. Reload the dashboard 24 hours later → still see all projects, no data loss.

Each acceptance step has a corresponding Sentry breadcrumb. The `spec-runner`
checks that for any session with prompts entered, the breadcrumb sequence
matches one of the valid lifecycle traces above.

---

## 9. Failure modes the spec EXPECTS

These are not bugs — the dashboard MUST handle them gracefully:

- Snack 4xx with "Missing required file: App.js" → `snack-client.ts` auto-injects `App.js` (✓ shipped 2026-05-28)
- LLM stream times out → `error` event, dashboard shows error message
- Watcher down → `/app-dev/health` returns `degraded`, build buttons disabled with tooltip
- ECS task restart mid-generation → user reload finds project + partial files restored from S3
- Cold S3 hydrate (no projects yet) → empty sidebar, no error
- User opens dashboard from old browser tab with stale `localStorage.zionx_studio_project_id` → silently ignore if project not found

---

## 10. What is OUT OF SCOPE for v1.0.0 of this spec

- Multi-user concurrent edits on the same project
- Real-time collaborative cursors
- Per-user budget enforcement (still global)
- Mobile-responsive layout for the dashboard itself
- Voice input
- Direct Git push / pull from inside the studio
- AI assistant memory across projects

These land in v1.1+ and will be appended via dated amendments.

---

## Compliance check (run per session)

Spec runner ingests the last N Sentry breadcrumbs and verifies, for any
session that hit Send (button #3):

- `studio.send` was followed within 5s by either `studio.createProject` or
  `studio.streamStart` (matching an existing project)
- `studio.streamStart` was followed eventually by `studio.streamDone` or
  `studio.streamError`
- If `studio.streamDone`, then within 60s either `studio.buildPreview` was
  fired OR the user explicitly skipped preview
- Any `studio.build` was followed within 5s by an HTTP 200/202 from
  `/app-dev/projects/:id/build`

Failures from the runner produce GitHub issues with a "spec-violation" label.
