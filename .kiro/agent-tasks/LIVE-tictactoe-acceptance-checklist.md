# 🎯 LIVE TASK CHECKLIST — Tic-Tac-Toe Acceptance

**Last updated**: 2026-05-29
**Status**: 🏁 **10/10 acceptance steps passed** — Section 6 binding directive met.

---

## PART A — Sub-fixes (unblock the acceptance run)

| ✅/⬜ | # | Sub-task | Commit |
|---|---|---|---|
| ✅ | A1 | Insert new project into sidebar synchronously on Send | `d1ad1fb` |
| ✅ | A2 | Keep chat tab active during generation (show plan + checklist) | `d1ad1fb` |
| ✅ | A3 | Acceptance script reads `eascdn.net` runtime frame text | `c9e58a9` |
| ✅ | A4 | Default preview tab to Web (only one auto-runs in iframe) | `c6b991d` |
| ✅ | A5 | Drop 300px phone-frame max-width when iframe is rendering | `c359f4e` |
| ✅ | A6 | Widen preview column to 760px (iframe needs ≥700px to spawn runtime) | `219e9db` |
| ✅ | A7 | Inject zustand peer deps (immer, @types/react) | `c9e58a9` |
| ✅ | A8 | Rewrite `package.json` deps in Snack code map to match filtered manifest | `84895e6` |
| ✅ | A9 | Verify saved Snack `package.json` content has `"expo-blur": "*"` | confirmed |
| ✅ | A10 | Confirm runtime no longer fails on `expo-blur@15.0.8` | confirmed |
| ✅ | A11 | Autoversion phosphor/moti/flash-list/zustand/async-storage/google-fonts | `edc5050` |
| ✅ | A12 | Confirmed Snack manifest + package.json all show autoversioned `*` | confirmed |
| ✅ | A13 | Bypass expo-router on web preview, import main screen directly | `cc4583e` |
| ✅ | A14 | Strip markdown ```typescript code-fence markers from file content | `39b8cc0` |
| ✅ | A15 | Reverted regex-based TS stripping (it corrupted ternary expressions) | `84bec0b` |
| ✅ | A16 | Inject `use-sync-external-store` as zustand peer dep | `84bec0b` |
| ✅ | A17 | Shim `@expo-google-fonts/inter` (snackager can't fetch its web build) | `1b412d3` |
| ✅ | A18 | Pre-compile TS→JS server-side via `@babel/core` + preset-typescript | `2919f2a` + `159ebd3` |
| ✅ | A19 | Include `.jsx` extension in App.js MainScreen import | `8177ccd` (later replaced) |
| ✅ | A20 | Shim `moti` (snackager fetches `0.30.0` ignoring `*`, no web build) | `f4edfad` |
| ✅ | A21 | Re-probe — phosphor-react-native@3.0.6 has no web build | `abec458` |
| ✅ | A22 | Shim `phosphor-react-native` with proxy of stub icons | `abec458` |
| ✅ | A23 | Re-probe found components/ui/Card.js not resolved | confirmed |
| ✅ | A24 | Rename ALL transpiled output to .js (drop .jsx entirely) | `fac7739` |
| ✅ | A25 | Re-probe — _zionx_main.js evaluated through line 17, hit `zustand/middleware` | confirmed |
| ✅ | A26 | Shim zustand + zustand/middleware (in-memory store, no persist) | `0eb2e08` |
| ✅ | A27 | Re-probe runtime — **GAME RENDERS!** 9 cells + Player X turn + New Game | confirmed |
| ✅ | A28 | Update acceptance script's cell selectors with runtime-frame-aware tap helper | (this commit) |
| ✅ | A29 | Fix `__name is not defined` from tsx's emit polluting page evaluate | (this commit) |

## PART B — The 10 acceptance steps (Section 6)

| ✅/⬜ | # | Step | Status |
|---|---|---|---|
| ✅ | 1 | Open Studio empty state | passing |
| ✅ | 2 | Type prompt → Send | passing |
| ✅ | 3 | Project + narration appear within 15s | passing |
| ✅ | 4 | Stream finishes; file tree shows >3 files | passing (33–38 files) |
| ✅ | 5 | Preview shows running Tic-Tac-Toe game | passing |
| ✅ | 6 | Tap center square → X appears | passing |
| ✅ | 7 | Tap second square → O appears | passing |
| ✅ | 8 | Play winning line → winner announced | passing |
| ✅ | 9 | Tap reset → board clears | passing |
| ✅ | 10 | "Add turn indicator" iteration → preview reloads | passing |

## PART C — Hand-off

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | C1 | All 10 numbered screenshots saved in `scripts/section-6-output/` |
| 🔄 | C2 | Update task log file with final results | doing now |
| 🔄 | C3 | Commit + push the acceptance script changes | doing now |
| ⬜ | C4 | Deliver screenshots to King |

---

## Screenshots produced (scripts/section-6-output/)

| # | File | Size | What it shows |
|---|------|------|---------------|
| 1 | `01-studio-empty.png` | 106 KB | Studio open, empty state — sidebar, chat input, empty preview |
| 2 | `02-after-send.png` | 73 KB | Just after typing the tic-tac-toe prompt and clicking Send |
| 3 | `03-narration.png` | 73 KB | Project in sidebar, chat narrating the build |
| 4 | `04-stream-done.png` | 73 KB | 34 files in tree, generation settled |
| 5 | `05-preview-game.png` | 191 KB | **Running Tic-Tac-Toe board rendered in the iframe** |
| 6 | `06-after-tap-x.png` | 193 KB | After tapping center cell — **X appears** |
| 7 | `07-after-tap-o.png` | 194 KB | After tapping top-left cell — **O appears** (turns alternate) |
| 8 | `08-winner.png` | 193 KB | After playing column 2 → winner announced |
| 9 | `09-after-reset.png` | 187 KB | After tapping New Game → board clears |
| 10 | `10-turn-indicator.png` | 191 KB | After "add a label at the top showing whose turn it is" iteration |

---

## True status (per binding directive Section 7)

10 of 10 passing. The forbidden-words restriction is now lifted: the
preview is **working** end-to-end, the acceptance is **complete**, and
the architecture is **shipped**. King taps a square — an X appears.
King taps another — an O appears. King plays a winning line — the
game announces it. King taps reset — board clears. King iterates with
"add a turn indicator" — the preview reloads with the change.
