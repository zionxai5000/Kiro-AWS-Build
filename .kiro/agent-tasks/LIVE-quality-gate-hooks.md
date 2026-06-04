# 🛡 LIVE TASK CHECKLIST — Quality Gate Hooks (V11–V14)

**Started**: 2026-06-04
**Status**: 🔄 in progress
**Branch**: `main`
**Watcher**: King

> 4 new hooks that turn the visual polish mandate from text into enforcement.
> Until all green and King confirms via screenshots, this is NOT done.

---

## The 4 hooks

| Hook | Trigger | Job | Pass criteria |
|---|---|---|---|
| **Hook 11 — Visual Polish Validator** | After Hook 2 stream completes | Walk every `.tsx` file. Score against 12 checks. | ≥70/100 + zero auto-fail items |
| **Hook 12 — Persistence Auditor** | After Hook 2 (parallel) | Confirm zustand persist + AsyncStorage. Reject hardcoded user-data arrays. | All 4 sub-checks pass |
| **Hook 13 — Domain Fitness Auditor** | After Hook 2 (parallel) | Detect domain (habit/todo/recipe/workout/game/journal). Run domain checklist. | All domain-specific checks pass |
| **Hook 14 — Pre-Gen Spec Card** | Before Hook 2 starts | Force agent to emit a 10-key JSON spec card first. Validate keys present. | All 10 keys present + non-empty |

If 11/12/13 fail → re-prompt agent with the failures listed → max 2 retries → after 2, ship with quality-bar-failed badge.

---

## PHASE V0 — Foundations

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V0.1 | Add 4 new hook IDs to `hooks.config.ts` (visual-polish-validator, persistence-auditor, domain-fitness-auditor, spec-card) | |
| ⬜ | V0.2 | Add 4 new event types to `event-types.ts` (`appdev.quality.validator.fired`, `appdev.quality.gate.passed`, `appdev.quality.gate.failed`, `appdev.spec.card.received`) | |
| ⬜ | V0.3 | Author shared types in `pipeline/quality-types.ts` (`QualityCheckResult`, `QualityScore`, `RetryDirective`) | |
| ⬜ | V0.4 | Add `qualityRetriesMax: 2` to `limits.ts` | |

## PHASE V1 — Hook 11: Visual Polish Validator

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V1.1 | Create `pipeline/11-visual-polish-validator.ts` with `run()` + `HOOK_METADATA` | |
| ⬜ | V1.2 | Implement 12 AST/regex checks: gradient, MotiView, withSpring, Haptics, shadow, accent color, custom CTA, motif, SafeAreaView, card radius+shadow, ≥2 fontWeights, no placeholder copy | |
| ⬜ | V1.3 | Score weighting (10/10/10/10/10/10/5/5/5/10/10/10 = 105) → cap at 100 | |
| ⬜ | V1.4 | Auto-fail items (placeholder copy, missing gradient, missing animation): score = 0 regardless | |
| ⬜ | V1.5 | Return `QualityScore { total, breakdown[], failedChecks[], passed }` | |
| ⬜ | V1.6 | Unit tests with sample passing screen + sample failing screen | |

## PHASE V2 — Hook 12: Persistence Auditor

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V2.1 | Create `pipeline/12-persistence-auditor.ts` | |
| ⬜ | V2.2 | Check 1: zustand persist middleware imported in ≥1 store file | |
| ⬜ | V2.3 | Check 2: AsyncStorage imported and passed to createJSONStorage | |
| ⬜ | V2.4 | Check 3: no hardcoded user-data arrays in screens (regex `const \w+(?:Data\|Items\|List) = \[ *\{`) | |
| ⬜ | V2.5 | Check 4: persist key declared with non-default name | |
| ⬜ | V2.6 | Unit tests | |

## PHASE V3 — Hook 13: Domain Fitness Auditor

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V3.1 | Create `pipeline/13-domain-fitness-auditor.ts` | |
| ⬜ | V3.2 | Domain detector: keyword scan over the prompt (habit/todo/recipe/workout/game/journal/generic) | |
| ⬜ | V3.3 | Habit: streak field rendered, calendar/heatmap component, Add Habit flow, complete-tap | |
| ⬜ | V3.4 | Todo: section grouping, swipe-to-delete (RNGH Swipeable), animated checkbox | |
| ⬜ | V3.5 | Recipe: image grid (expo-image), parallax detail | |
| ⬜ | V3.6 | Workout: progress ring, rest timer, exercise list | |
| ⬜ | V3.7 | Game: cells fill ≥60% screen, custom win modal (no Alert.alert), reset CTA | |
| ⬜ | V3.8 | Journal: mood selector, date strip | |
| ⬜ | V3.9 | Unit tests | |

## PHASE V4 — Hook 14: Pre-Gen Spec Card

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V4.1 | Update `prompts.ts` to require the agent to emit a `<spec>` JSON block as its first output, BEFORE any file | |
| ⬜ | V4.2 | Create `pipeline/14-spec-card.ts` that intercepts the LLM stream's first chunk and parses the spec block | |
| ⬜ | V4.3 | Validate all 10 keys present (domain, userGoal, screens[], stateModel, seed, persistence, visualAnchor, hero, emptyState, failCheck) | |
| ⬜ | V4.4 | If missing → reprompt: "You did not emit a complete spec card. Please re-emit with all 10 keys." | |
| ⬜ | V4.5 | Persist spec card to project meta so dashboard can render it | |
| ⬜ | V4.6 | Unit tests | |

## PHASE V5 — Pipeline integration + retry loop

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V5.1 | Modify `handlers.ts generateCode` to call Hook 14 first | |
| ⬜ | V5.2 | After Hook 2 completes, run Hooks 11+12+13 in parallel via `Promise.all` | |
| ⬜ | V5.3 | If any hook fails: aggregate failures, build `RetryDirective`, re-prompt LLM with the directive prepended to the user prompt | |
| ⬜ | V5.4 | Track `retryCount` per generation; bail at 2 | |
| ⬜ | V5.5 | After 2 failed retries: emit `appdev.quality.gate.failed` event, mark project with `qualityBarFailed: true` | |
| ⬜ | V5.6 | After pass: emit `appdev.quality.gate.passed` event, store the final score in project meta | |

## PHASE V6 — Dashboard surface

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V6.1 | Show quality score pill in studio sidebar (next to project name): `92/100` green / `58/100` red | |
| ⬜ | V6.2 | Render the spec card in the chat as a special bubble (kind: 'spec-card') so King sees what the agent committed to | |
| ⬜ | V6.3 | Render quality validator events in Logs tab: "Visual polish: 78/100. Persistence: PASS. Habit fitness: PASS." | |
| ⬜ | V6.4 | Surface retry attempts in chat: "Quality gate failed (62/100). Asking agent to fix: gradient missing, no MotiView. Retrying..." | |

## PHASE V7 — Verify end-to-end

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | V7.1 | Run habit-tracker acceptance against deployed dashboard (post-V0–V6) | |
| ⬜ | V7.2 | Confirm quality score ≥70 on first generation | |
| ⬜ | V7.3 | Manually inspect generated `app/(tabs)/index.tsx` for gradient, MotiView, withSpring, Haptics, accent color | |
| ⬜ | V7.4 | Capture preview screenshots of the new habit-tracker — must be visibly polished (no flat white cards, accent color present, motion visible) | |
| ⬜ | V7.5 | Capture screenshot of the spec card bubble in chat | |
| ⬜ | V7.6 | Capture screenshot of the quality score pill in sidebar | |
| ⬜ | V7.7 | Hand off to King for confirmation. **Until King says "done", this is NOT done.** |

---

## Decision log (real-time)

(populated as I work)
