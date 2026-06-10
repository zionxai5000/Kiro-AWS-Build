# SeraphimOS Platform — Full Build Spec (VibeCode parity)

> Source: VibeCode comparison conversation (2026-06-10). Saved verbatim
> from VibeCode's `SERAPHIM_SPEC_FOR_KIRO.md` so the requirements live in
> the repo, not in chat history. This document is the canonical "what to
> build" reference. Implementation status lives in
> `.kiro/agent-tasks/tasks.md` group G2.

## Goal

Make ZionX App Development feel like an **AI platform**, not a build-log
viewer. The user types intent, the AI thinks visibly, action produces a
tangible artifact, and every artifact links back to the chat that made it.

## 0. Layout (exact grid)

Three columns, full height. **Only panels scroll — never the page.**

```
┌──────────────┬────────────────────────────┬────────────────────────────┐
│  LEFT NAV    │  CENTER (chat + workspace) │  RIGHT (preview)           │
│  260px fixed │  flex 1 (min 480px)        │  clamp(380px, 38vw, 560px) │
└──────────────┴────────────────────────────┴────────────────────────────┘
```

```css
.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(480px, 1fr) clamp(380px, 38vw, 560px);
  height: 100dvh;        /* dvh fixes mobile browser-bar cutoff */
  overflow: hidden;       /* page never scrolls */
}
.app-shell > * { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
.panel-body { flex: 1; overflow-y: auto; min-height: 0; }
```

**The rule that fixes 90% of cutoffs:** every scrolling flex child needs
`min-height: 0`.

## 1. Preview pane fix (the immediate live blocker)

The preview cuts off because the device frame is taller than its column
with no scaling and no scroll. Fix is **scale a fixed device frame to fit
its container**.

```
RIGHT PANE
├─ Toolbar (44px)   → device toggle, refresh, open-in-new, zoom %
├─ Stage (flex: 1)  → centers + scales the phone to fit
│    └─ Device frame (fixed 390×844)
│         └─ <iframe> live app
└─ Status bar (28px) → ● live · url · build time
```

```ts
useLayoutEffect(() => {
  const fit = () => {
    const { height, width } = stageRef.current.getBoundingClientRect();
    setScale(Math.min((height - 32) / 844, (width - 32) / 390, 1));
  };
  fit();
  const ro = new ResizeObserver(fit); ro.observe(stageRef.current);
  return () => ro.disconnect();
}, []);
```

```css
.stage { flex: 1; display: grid; place-items: center; overflow: hidden; background: #0b0e14; }
.device-frame {
  width: 390px; height: 844px; flex: none;
  transform: scale(var(--scale)); transform-origin: center;
  border-radius: 44px; border: 10px solid #1c2230; overflow: hidden;
}
.device-frame iframe { width: 100%; height: 100%; border: 0; }
```

**Acceptance:** at any window height the whole phone is visible and
centered, never clipped; scrolling happens inside the phone.

**King's amendment:** the user wants TWO modes — **scale-to-fit** AND
**scroll-inside-pane** (toggle in the toolbar). Plus the existing
fullscreen.

## 2. Full delivery tree

```
SeraphimOS
├── 🏠 King's View ........ dashboard: live agents, projects, "New build" box
├── 💬 Chat ............... INTENT — talk to AI, streaming thinking
├── 🤖 Agents Live ....... Builder · Critic/QA · Marketing (live cards)
├── 🗂️ WORKSPACE ......... the artifact tabs
│     ├── 📄 Code ........ editor, file tree, diffs, "AI edited these"
│     ├── 📁 Files ....... all assets, upload/download, versions
│     ├── 🖼️ Image ....... generated/uploaded images
│     ├── 🔊 Audio ....... sounds, voice, TTS
│     └── 🗄️ Database .... tables, rows, schema, live data
├── 🔍 OBSERVE
│     ├── 📋 Logs ........ build+runtime, "Ask AI why"
│     └── 🌐 Request ..... API inspector, replay a call
├── 🚀 DELIVER
│     ├── 👁️ Preview ..... live app (scaled, §1)
│     ├── 🔗 Share ....... public link/QR, invite testers
│     └── ☁️ Deploy ...... publish, App Store, version + rollback
└── ⚙️ Intelligence ..... Memory · Model · API · Settings
```

## 3. Section specs — purpose · components · data · acceptance

### 💬 Chat — the driver

- **Components:** message list, streaming "Thinking…" collapsible,
  composer with file/image/audio/voice attach, per-action chip
  ("edited board.tsx →").
- **Data:** `Message { id, role, text, streaming, actions[], ts }`.
- **Accept:** replies stream token-by-token; thinking line shows before
  action; every chip deep-links to its artifact.

### 🤖 Agents Live — AI workforce as presence

- **Components:** agent card (avatar, status dot, current task,
  mini-log), start/stop.
- **Data:** `Agent { id, name, role, status, task, heartbeat }`.
- **Accept:** live status; clicking filters Logs/Code to that agent.

### 📄 Code

- **Components:** file tree, editor, diff toggle, "AI changed" badges,
  revert, "← made in chat" backlink.
- **Data:** `FileNode { path, type }`, `Diff { path, added, removed, byMessageId }`.
- **Accept:** AI edits highlight changed lines + files; revert restores;
  diff links back to its chat message.

### 📁 Files — single source of truth

- **Components:** grid, drag-drop upload, download, version history,
  type filter.
- **Data:** `Asset { id, name, kind, size, version, ts }`.
- **Accept:** Image & Audio are filtered views of this same store.

### 🖼️ Image

- **Components:** gallery, "generate image" prompt, "use in app", "use as
  icon/listing".
- **Accept:** "use in app" inserts a real reference into Code and shows
  where it's used.

### 🔊 Audio

- **Components:** clip list, player, record, TTS prompt, "wire to event"
  (e.g. `onWin`).
- **Accept:** wiring a clip writes the hookup into Code automatically.

### 🗄️ Database

- **Components:** table list, schema view, editable row grid, "AI created
  this".
- **Data:** `Table { name, columns[], rows[] }`.
- **Accept:** schema changes show a diff; rows live; links to the
  Request calls that hit it.

### 📋 Logs

- **Components:** build + runtime stream, level filter, search, "Ask AI"
  button on any line.
- **Data:** `LogLine { level, source, text, ts, traceId }`.
- **Accept:** "Ask AI" opens Chat pre-loaded with that line.

### 🌐 Request

- **Components:** request list, req/res detail, headers/body, replay,
  timing.
- **Data:** `ReqLog { method, url, status, reqBody, resBody, ms, traceId }`.
- **Accept:** replay re-sends; failed calls link to the Log line + DB row
  via `traceId`.

### 🔗 Share

- **Components:** public link, QR, tester invite, expiry, views.
- **Accept:** link opens the Preview build publicly; tester bugs flow
  into Logs/Request.

### ☁️ Deploy

- **Components:** env toggle (Preview/Prod), Deploy button, build
  progress, version list, rollback, App Store status.
- **Data:** `Deploy { id, env, version, status, snapshot { code, files, db }, ts }`.
- **Accept:** each deploy is an immutable snapshot of Code + Files + DB;
  rollback restores one.

## 4. Two-way linking (the magic that makes it feel AI-native)

- **Forward:** chat action chip → "see it →" → opens the exact artifact.
- **Back:** any artifact → "← made by" → scrolls Chat to the message
  that created it.
- **Shared keys:** `byMessageId` on every diff/asset/table change;
  `traceId` ties Logs ↔ Request ↔ Database together.

## 5. Use cases (end-to-end flows)

| # | Flow across sections |
|---|---|
| 1 | **Build feature:** Chat "add win sound" → Builder writes Code + clip to Audio + wires `onWin` → Logs pass → Preview plays it |
| 2 | **Fix bug:** Logs error → "Ask AI" → Chat explains → edits Code → Request shows 200 → Preview confirmed |
| 3 | **Add data:** "Save high scores" → Database table created → Request shows save call → Preview leaderboard |
| 4 | **Brand:** "Make a logo" → Image → "use as icon" writes Code + Deploy listing → Preview |
| 5 | **Multi-agent ship:** Builder → Critic/QA flags in Logs → Marketing copy → Deploy snapshot → Share link → rollback |
| 6 | **Debug tester report:** Share link bug → Logs + Request → traceId → Database row → "Ask AI" → fix Code → re-Deploy |
| 7 | **Iterate by chat:** "Glow X blue, add reset" → edits Code → Preview live → diff with backlink |

## 6. Design tokens (AI-platform feel)

```
bg-0  #0b0e14 (app)
bg-1  #11151f (panels)
bg-2  #1a2030 (cards)
line  #232a3a
text-0 #e6edf3
text-1 #9aa7b8 (muted)
accent #6e8bff (AI blue)
good  #36d399
warn  #fbbd23
bad   #f87272
radius  12px cards · 44px device
fonts   Inter + JetBrains Mono
motion  thinking dots 1.2s · token stream 16ms/char · status dot breathe 2s
```

## 7. Build order checklist

- [ ] App shell 3-col grid (`100dvh` + `min-height: 0`)
- [ ] Preview scale-to-fit + scroll toggle (fixes cutoff) — §1
- [ ] Left nav = full delivery tree — §2
- [ ] Chat: streaming + thinking + action chips
- [ ] WORKSPACE tabs: Code · Files · Image · Audio · Database
- [ ] OBSERVE: Logs + Request with "Ask AI"
- [ ] DELIVER: Share + Deploy (snapshot + rollback)
- [ ] Two-way linking bus (`byMessageId` / `traceId`)
- [ ] Agents Live cards
- [ ] Apply design tokens

## "Feels like an AI platform" — done when

- Page never scrolls.
- Preview never clips.
- Chat streams with visible thinking.
- Every AI action deep-links to a real artifact.
- Every artifact links back to the chat that made it.
