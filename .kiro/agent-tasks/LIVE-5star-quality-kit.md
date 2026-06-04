# 🛡 LIVE TASK CHECKLIST — 5-Star Quality Kit + Real Polish

**Started**: 2026-06-04
**Status**: 🔄 in progress
**Branch**: `main`
**Watcher**: King

> Two-track work:
> 1. **Track A** — Drop in King's steering kit (5 files + 2 scripts + 2 hooks) for future Kiro sessions
> 2. **Track B** — Material upgrades to the running agent so the next habit tracker is actually 5-star
> Final deliverable: NEW screenshots of habit tracker showing populated state with real polish.

---

## My choices (no more questions)

| Decision | What I picked | Why |
|---|---|---|
| Ship kit (A) or ship kit + golden starter (B) | **B** — both | Golden starter is the single biggest reliability win |
| Bash scripts vs TS port | **Bash** | Matches the kit, runs on Git Bash for Windows, no extra deps |
| Per-screen Hook 11 vs merged-source Hook 11 | **Per-screen** | This is what fixed the "95/100 but flat empty state" bug — the merged-source check let polish hide in unused files |
| Onboarding check location | **New Hook 15** | Cleaner than expanding Hook 13; easier to disable independently |
| Populated-state screenshots | **Yes, automated** | The empty state is the easy view; populated is what King grades |

---

## PHASE Q1 — Drop in steering kit (5 files)

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q1.1 | Create `.kiro/steering/00-quality-bar.md` |
| ⬜ | Q1.2 | Create `.kiro/steering/10-design-system.md` |
| ⬜ | Q1.3 | Create `.kiro/steering/20-persistence.md` |
| ⬜ | Q1.4 | Create `.kiro/steering/30-onboarding.md` |
| ⬜ | Q1.5 | Create `.kiro/steering/40-store-readiness.md` |

## PHASE Q2 — Scripts + Hooks setup doc

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q2.1 | Create `.kiro/scripts/verify-app.sh` |
| ⬜ | Q2.2 | Create `.kiro/scripts/check-no-static-data.mjs` |
| ⬜ | Q2.3 | Create `.kiro/hooks/HOOKS-SETUP.md` |
| ⬜ | Q2.4 | Use `createHook` tool to programmatically create Hook 1 (Prompt Submit) |
| ⬜ | Q2.5 | Use `createHook` tool to programmatically create Hook 2 (Agent Stop) |
| ⬜ | Q2.6 | Sanity-check the scripts (Node + bash via Git Bash) |

## PHASE Q3 — Pipeline upgrade: per-screen visual scoring

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q3.1 | Refactor Hook 11 to score each screen file independently |
| ⬜ | Q3.2 | Take the WORST score across screens (not the best) — overall = min(scores) |
| ⬜ | Q3.3 | Each screen file with screen-export must score ≥70 to pass |
| ⬜ | Q3.4 | Update unit tests |

## PHASE Q4 — New Hook 15: Onboarding Auditor

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q4.1 | Create `pipeline/15-onboarding-auditor.ts` |
| ⬜ | Q4.2 | Check 1: `OnboardingFlow.tsx` (or `app/onboarding/_layout.tsx`) exists |
| ⬜ | Q4.3 | Check 2: routes to onboarding when `hasCompletedOnboarding` flag is false |
| ⬜ | Q4.4 | Check 3: completion flag persisted via zustand persist or AsyncStorage directly |
| ⬜ | Q4.5 | Check 4: re-openable from settings (skipped if no settings screen) |
| ⬜ | Q4.6 | Wire into quality-gate-runner alongside Hook 11/12/13 |
| ⬜ | Q4.7 | Unit tests |

## PHASE Q5 — Golden starter template

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q5.1 | Create `templates/golden-starter/src/theme/tokens.ts` (Calm-inspired) |
| ⬜ | Q5.2 | Create `templates/golden-starter/src/data/index.ts` (zustand persist + AsyncStorage shell) |
| ⬜ | Q5.3 | Create `templates/golden-starter/src/onboarding/OnboardingFlow.tsx` (3-step skippable) |
| ⬜ | Q5.4 | Create `templates/golden-starter/README.md` explaining usage |

## PHASE Q6 — Material LLM prompt upgrade

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q6.1 | Add SECTION -3: "Onboarding required" to system prompt |
| ⬜ | Q6.2 | Add stronger "main screen polish" rule — every screen with `export default function` must have gradient bg + MotiView + at least one shadowed card |
| ⬜ | Q6.3 | Reference the golden-starter pattern in the prompt |

## PHASE Q7 — Push, deploy, run habit tracker

| ✅/⬜ | # | Task |
|---|---|---|
| ⬜ | Q7.1 | Commit + push all phases |
| ⬜ | Q7.2 | Wait for ECS rollover |
| ⬜ | Q7.3 | Trigger fresh habit tracker generation via API |
| ⬜ | Q7.4 | Wait for quality gate to pass (with retries) |
| ⬜ | Q7.5 | POST /preview to save Snack |
| ⬜ | Q7.6 | Capture screenshot of empty state |
| ⬜ | Q7.7 | Programmatically add 3 habits via the runtime DOM, screenshot populated state |
| ⬜ | Q7.8 | Capture screenshot after marking 1 habit complete (streak rendering proof) |
| ⬜ | Q7.9 | Capture screenshot of onboarding flow (force first-launch reset) |
| ⬜ | Q7.10 | Hand off all 4+ screenshots to King |

---

## Decision log (real-time)
