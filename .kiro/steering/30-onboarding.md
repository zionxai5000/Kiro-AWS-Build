---
inclusion: always
---

# Onboarding & walkthrough (required in every app)

Every generated app ships a first-run experience and a re-openable explainer.
This is a gate, not an optional nicety.

## What every app must include

1. **First-run walkthrough** — a 3–5 step intro shown on first launch that
   explains what the app does and the one core action. Carousel or sequential
   coachmarks.
   - Must be **skippable** (a visible "Skip" affordance).
   - Must set a persisted flag (e.g. `hasCompletedOnboarding`) so it shows once.
   - Must end on the primary action, not a dead end.
2. **In-context coachmarks** (when the main screen has non-obvious gestures) —
   a one-time tap-through highlighting the key interaction.
3. **Re-openable "How it works"** — reachable any time from Settings/Help, so
   users who skipped can revisit. Same content as the walkthrough.

## Implementation contract

- Component lives at `src/onboarding/OnboardingFlow.tsx` (this exact path/name
  is checked by the verification script). Expo Router projects may instead use
  `app/onboarding/_layout.tsx` plus step files; either pattern satisfies the
  gate so long as a clearly-named onboarding component exists.
- It is wired to first launch: the app routes to onboarding when
  `hasCompletedOnboarding` is false, otherwise to the main screen.
- The flag is stored in the real persistence layer (not an in-memory variable
  that resets on reload). For zustand+persist projects, store the flag in the
  same persisted store as the rest of state.
- Visuals come from the design system: calm, spacious, one idea per step, soft
  illustration or icon per step, slow fade/rise transitions, reduced-motion
  honored.

## Quality bar for onboarding

- No walls of text. One short sentence per step.
- No generic "Welcome!" with three identical screens — each step earns its place.
- Friendly, plain language. No jargon.
- Accessible: each step has a screen-reader label, controls are 44pt+ targets.

## Checklist (must all be true)

- [ ] `src/onboarding/OnboardingFlow.tsx` (or `app/onboarding/*`) exists and renders.
- [ ] First launch routes to it; subsequent launches skip it.
- [ ] Skippable, and the completion flag persists across reload.
- [ ] Re-openable from Settings/Help.
- [ ] Styled only from the design system.
