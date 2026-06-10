# 🛡 LIVE TASK CHECKLIST — Habit Tracker Screenshots + Dashboard Fix

**Started**: 2026-06-04 (continued from prior session)
**Status**: 🔄 in progress
**Branch**: `main`
**Watcher**: King

> Goal: Show King 5-star quality habit tracker screenshots in the dashboard
> after fixing the layout cutoff and shim gaps. Resumable — always shows
> current step.

---

## My choices (no more questions)

| Decision | What I picked | Why |
|---|---|---|
| Dashboard CSS device-frame collapse | **Always fill 100% width/height** | King's directive: "the container should be the same size as the overall application" |
| Habit tracker prompt source | Use `.gen-body.json` (already pre-tuned) | Same prompt that exercises Hooks 11-15 quality gate |
| Screenshot timing | After ECS rolls + Snack saves | Otherwise we'd capture broken state |
| Stuck-runtime fallback | Use empty-state screenshot | Snack web preview bypasses expo-router; multi-screen flow needs simulator |

---

## PHASE A — Commit + Deploy Dashboard CSS Fix

| ✅/⬜ | # | Task |
|---|---|---|
| ✅ | A.1 | Stage `packages/dashboard/src/views/studio-tokens.ts` |
| ✅ | A.2 | Commit `2de6e9e` — "fix(dashboard): device frame always fills preview pane (no aspect-ratio collapse)" |
| ✅ | A.3 | Pushed to origin/main (`1c6502a..2de6e9e main -> main`) |
| ⬜ | A.4 | Confirm GitHub Actions Deploy workflow triggered |
| ⬜ | A.5 | Wait ~2-3 min for S3 sync (dashboard live) |
| ⬜ | A.6 | Hard-refresh probe: device frame width should fill full pane |

## PHASE B — Generate Fresh Habit Tracker

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | B.1 | POST /api/app-dev/projects with `.body.json` (creates project shell) |
| ⬜ | B.2 | POST /api/app-dev/projects/{id}/generate with `.gen-body.json` (Claude streams) |
| ⬜ | B.3 | Wait for quality gate to pass (Hooks 11-15, 2-retry loop) |
| ⬜ | B.4 | POST /api/app-dev/projects/{id}/preview to push Snack |
| ⬜ | B.5 | Confirm preview URL returns 200 |

## PHASE C — Capture Screenshots

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | C.1 | Capture dashboard view at 1600×800 (King's viewport) |
| ⬜ | C.2 | Capture preview pane in isolation (full device frame) |
| ⬜ | C.3 | Capture app empty state (first launch — onboarding) |
| ⬜ | C.4 | Capture app post-onboarding state (main screen) |

## PHASE D — Hand-off

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | D.1 | Verify all PNGs exist + sizes |
| ⬜ | D.2 | Update this checklist with paths + scores |
| ⬜ | D.3 | Show King the screenshots |

---

## Live status log (newest first)

