# 🎯 LIVE TASK CHECKLIST — Habit Tracker + Persistence + Polish + VibeCode Parity

**Started**: 2026-06-03
**Status**: 🔄 in progress
**Branch**: `main`
**Watcher**: King

> Every step gets a row. Every commit gets a SHA. King can refresh this file to see exactly where I am.

---

## King's 4 demands (parsed)

| # | Demand | Becomes phase |
|---|--------|---------------|
| 1 | "Make sure we are saving all the games to memory" | **PHASE H2** — verify + harden persistence |
| 2 | "Game must have a NAME, not just text. Once complete it goes to a 'Projects' tab where I can view + edit" | **PHASE H1** (naming) + **PHASE H3** (Projects tab) |
| 3 | "Graphics are okay but I still don't like them. Build me a habit tracker. The prompt must produce a 5-star App Store app. No static data, full persistence" | **PHASE H4** (prompt rewrite) + **PHASE H5** (habit-tracker acceptance) |
| 4 | "Review VibeCode's setup again, add features we don't have" | **PHASE H6** — parity gaps |

---

## PHASE H1 — Smart project naming (`Tic Tac Toe`, not `Build me a tic-tac-...`)

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H1.1 | Add `deriveProjectName(prompt)` in dashboard — extract 2-4 word title from prompt with regex/heuristic | |
| ⬜ | H1.2 | Update `sendPrompt()` to call it instead of `text.slice(0, 60)` | |
| ⬜ | H1.3 | Test names: "Tic Tac Toe", "Habit Tracker", "Recipe Manager", "Todo List" | |
| ⬜ | H1.4 | Render derived name in sidebar + Projects tab | |

## PHASE H2 — Persistence verification (S3 mirror is real)

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H2.1 | Verify `S3WorkspaceStore.hydrateAll()` runs at boot in production-server.ts | |
| ⬜ | H2.2 | Verify `workspace.setDurableStore(store)` is wired so writes mirror to S3 | |
| ⬜ | H2.3 | Add a "💾 saved" badge per project in sidebar with last-synced timestamp | |
| ⬜ | H2.4 | Test refresh: create project → refresh page → confirm sidebar still shows it | |
| ⬜ | H2.5 | Test container-restart proxy: stop+start ECS task → confirm projects still listed | |

## PHASE H3 — Projects tab (separate completed-apps view)

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H3.1 | Add a new top-level dashboard tab: "Projects" (sibling to "Studio") | |
| ⬜ | H3.2 | Renders grid of completed projects (status=ready) with name + screenshot | |
| ⬜ | H3.3 | "View" button → opens read-only preview in modal | |
| ⬜ | H3.4 | "Edit" button → opens project in Studio with chat history loaded | |
| ⬜ | H3.5 | Empty state: "No completed projects yet — create one in Studio" | |

## PHASE H4 — Visual polish: rewrite the system prompt for 5-star quality

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H4.1 | Re-read VibeCode audit Section 10 (Native UI primitives vocabulary) | |
| ⬜ | H4.2 | Strengthen SECTION 0 with explicit "5-star App Store quality" mandate | |
| ⬜ | H4.3 | Add Native UI vocabulary: Large Header Titles, Bottom Sheets (Gorhom), Swipe-to-delete (RNGH), Haptics, Segmented Control, Liquid Glass tabs, ContextMenu (Zeego), Date pickers | |
| ⬜ | H4.4 | Add per-domain visual guidance section: habit-tracker → streak flames + calendar heatmap + progress rings; todo → swipe-delete + organic checkmarks; recipe → photo cards with shadow | |
| ⬜ | H4.5 | Explicit ban on placeholder/lorem-ipsum/static-array data — "no `const fakeData = [...]`. Use AsyncStorage or zustand-persist for state. Seed with 3-5 realistic examples on first launch only." | |
| ⬜ | H4.6 | Add typography hierarchy directive: SF Pro / Inter, 28-32px headers, line-height 1.2, letter-spacing -0.02em | |
| ⬜ | H4.7 | Add motion directive: every state change is animated (Moti or Reanimated), 250ms ease-out | |
| ⬜ | H4.8 | Add color-token directive: a primary accent color, 2 surface tones, 1 accent gradient — declared at top of design system file | |

## PHASE H5 — Habit Tracker acceptance test (5-star quality bar)

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H5.1 | Author `scripts/section-7-habit-tracker.ts` (10-step Playwright acceptance) | |
| ⬜ | H5.2 | The prompt: "Build me a habit tracker app where I can add habits, mark them complete each day, see streaks, and view a calendar heatmap. 5-star App Store quality. Persistence. No static data — habits I add must persist on refresh." | |
| ⬜ | H5.3 | Steps: empty state → add habit → mark complete → streak appears → check calendar heatmap → refresh → habit still there → delete habit → confirm gone | |
| ⬜ | H5.4 | Visual quality gate: average iframe brightness ≥ 100 (avoids all-white/all-dark), pixel variance ≥ 800 (proves not a static screen) | |
| ⬜ | H5.5 | Capture 10 numbered screenshots in `scripts/section-7-output/` | |
| ⬜ | H5.6 | All 10 steps must pass for ship | |

## PHASE H6 — VibeCode parity gaps

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H6.1 | Empty state: 4 example-prompt buttons that fill the input ("Habit tracker", "Todo list", "Recipe manager", "Workout log") | |
| ⬜ | H6.2 | Explicit "Refresh preview" button in preview toolbar | |
| ⬜ | H6.3 | Failure messages with remediation links (5 doc-cited failure modes) | |
| ⬜ | H6.4 | Pre-flight check banner ("App Store ready in N steps") if user clicks Deploy | |
| ⬜ | H6.5 | "+ New chat" clarification (already exists, but tooltip explains it starts fresh context) | |

## PHASE H7 — Ship

| ✅/⬜ | # | Task | Commit |
|---|---|---|---|
| ⬜ | H7.1 | `npm run build` clean | |
| ⬜ | H7.2 | Commit + push (one phase per commit, multi-line cmd-safe messages) | |
| ⬜ | H7.3 | Wait for ECS rollover, confirm new task spawned | |
| ⬜ | H7.4 | Run habit-tracker acceptance against deployed instance | |
| ⬜ | H7.5 | Capture all screenshots, deliver to King | |

---

## Decision log (real-time)

