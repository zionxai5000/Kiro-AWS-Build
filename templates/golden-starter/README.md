# Golden Starter Template

The agent uses this as the seed for every new app. It contains the three
foundations the quality gate enforces:

1. `src/theme/tokens.ts` — design system tokens (Calm-inspired)
2. `src/data/index.ts` — zustand persist + AsyncStorage data layer shell
3. `src/onboarding/OnboardingFlow.tsx` — 3-step skippable onboarding

The agent should **copy these files** into a new generated app, then add
domain-specific code on top. Don't rebuild these from scratch each time —
that's where consistency drops.

## Structure

```
src/
├── theme/
│   └── tokens.ts          # Color, typography, spacing, radius, motion
├── data/
│   └── index.ts           # Generic persist store with hasCompletedOnboarding
├── onboarding/
│   └── OnboardingFlow.tsx # 3-step carousel, calls completeOnboarding() at end
└── App.tsx (template)     # Routes to Onboarding when flag is false
```

## Why this exists

Without a starter template, the agent rebuilds the foundations every time.
With the template, generation is faster (fewer tokens), more consistent
(same files = same checks pass), and higher quality (the template was
designed once, carefully).
