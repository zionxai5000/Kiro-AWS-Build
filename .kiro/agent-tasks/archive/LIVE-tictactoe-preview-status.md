# LIVE — Tic-Tac-Toe Preview Pipeline (real-time status)

Updated: 2026-06-10 03:25 UTC

## Goal King set

> "Build a tic-tac-toe game with upgraded features and top-of-line UX,
>  watch it carefully, check for any errors, send screenshot when done."

## Where we are right now

The dashboard at `?harness=1` works. The agent runs fine. The agent
produces 30 real files for a tic-tac-toe project (board, cells, store,
animations, persistence). **The preview iframe doesn't render the game**
because the server-side bundle's last-mile upload to the E2B sandbox
silently drops every file.

Latest run: bundle `proj-1781061060731-9f66de16`, finished `expo export`
in 193 seconds, then `bundle-uploaded: 0 files uploaded (20 skipped)`.
Deployed `9616226` to surface the actual error.

## Stuck on

**The E2B SDK call `sandbox.files.write(path, Buffer)` is throwing on
every file in the export output and we don't yet know why.** The next
deploy adds a phase event with the first error message so it appears in
the chat narration.

## What's been done this session

11 commits, each fixed a real, deterministic production bug.

| # | Commit | Bug it fixed |
|---|---|---|
| 1 | `35243dc` | wakeSandbox didn't sync files or start a server; saved-project click stayed at "Sandbox Not Found" |
| 2 | `20311da` | Server-side bundling — moved npm install OUT of the sandbox (E2B network was timing out) |
| 3 | `77726fe` | Sandbox died 5 min post-bundle. Added 4-min ECS-side keepalive pings |
| 4 | `6291f2d` | Agent emitted fake package versions (`@motify/components`); added dep-validator gate + skill update |
| 5 | `8731795` | `npm install` failed on RN postinstall (`bob: not found`) — added `--ignore-scripts` |
| 6 | `b01d3c2` | Dockerfile didn't copy `templates/golden-starter/` so seed silently no-op'd. Added COPY. |
| 7 | `8b96f46` | `expo export` was failing silently. Now surfaces stderr + uses extension-based binary detection. |
| 8 | `831b85a` | Agent put `expo-haptics` in `app.json` plugins. Added skill section + auto-sanitizer. |
| 9 | `bce4014` | Multi-task race: `seedFromGoldenStarter` used `fs.cp` which doesn't mirror to S3. Now uses `writeFile` per-file. |
| 10 | `3d74a8e` | Agent kept hallucinating different deps. Bundler now overlays canonical golden-starter package.json on every build. |
| 11 | `8954e51` | Added `react-native-svg` peer dep (required by `lucide-react-native`) |
| 12 | `7bdc5fa` | Deploy workflow path filter didn't include `templates/` |
| 13 | `2629ec3` | Bundle classification: byte-heuristic was wrong, switched to extension whitelist |
| 14 | `60d5dc0` | Extension whitelist was incomplete (Expo SDK 54 uses `_expo/static/...` paths). Switched to upload-everything-as-Buffer. |
| 15 | `9616226` | Surface the upload-fail error (current deploy) |

## What King will see if they reload the dashboard right now

- ✅ Bare URL → King's View, full nav, every tab works
- ✅ Click ZionX → App Development → harness studio mounts
- ✅ Type a prompt → agent runs end-to-end, writes real files
- ✅ Chat narration shows tool chips, agent text, spec card
- ❌ **Preview iframe still empty** — bundle uploads to sandbox fail
- ❌ Sidebar shows ~80 "saved" projects, all of them in the same broken state

## Why this is taking so long (honest)

Each fix needs the full deploy cycle to verify:
- Push (instant)
- GitHub Actions deploy (~80s)
- ECS rolls 2 tasks (~160s)
- Backend boot + S3 hydration (~90s)
- Drive an agent run (~3-5 min)
- Server bundle (~90-200s)

That's **~12 minutes per loop, minimum.** I can't reproduce the bundler
locally because it depends on the live E2B sandbox API. Every layer of
the pipeline had a separate failure mode that only surfaced once the
previous one was fixed.

## What I should have done differently

1. Ran the bundler locally with a stub sandbox client to catch upload-API issues before deploying
2. Added the upload error surfacing in the FIRST bundler version, not after 4 silent-fail iterations
3. Pushed a single bigger fix instead of 5+ small ones once I saw the pattern of "discover next layer's bug"

## Plan for the next two iterations

**Iteration 16 (deploying now, ~12 min away):** error message visible →
shows whether E2B's `files.write(Buffer)` accepts buffers, rejects them,
or has a path issue.

**Iteration 17:** based on error, either:
- (a) Convert Buffer → base64 string + decode in sandbox via shell (~3 min fix)
- (b) Use E2B's filesystem upload API directly if SDK exposes one (~5 min)
- (c) Run `python3 -m http.server` from the SERVER bundle dir over a port forwarder (skips sandbox upload entirely, ~10 min refactor)

After (16) completes, expecting one more deploy → working preview →
King gets the screenshot.

## Other live workstreams (untouched this turn)

| File | Unchecked |
|---|---|
| `LIVE-zionx-agent-harness.md` | 0 |
| `LIVE-quality-gate-hooks.md` | ~13 |
| `LIVE-tictactoe-acceptance-checklist.md` | 2 (E7, C4 — both blocked on this preview working) |
| `LIVE-habit-tracker-and-polish.md` | 18 |
| `LIVE-5star-quality-kit.md` | 10 |
| `LIVE-48-or-die.md` | 12 |
| `LIVE-habit-tracker-screenshots-2026-06-04.md` | 15 |

Total ~70 unchecked, but the path forward on most of them is the same:
get the preview rendering, then unwind everything else.
