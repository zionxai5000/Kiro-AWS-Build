# Golden Starter Template

The agent uses this as the seed for every new app. It contains the three
foundations the quality gate enforces, plus a complete Expo + expo-router
shell so freshly-scaffolded apps boot cleanly.

## What's in here

```
templates/golden-starter/
├── package.json              Expo SDK 54, expo-router, zustand, moti, expo-blur, etc.
├── app.json                  Bundle id, scheme, plugins
├── babel.config.js           expo + reanimated/plugin
├── metro.config.js
├── tsconfig.json             extends expo/tsconfig.base, strict on
│
├── app/                      Expo Router file-based routes
│   ├── _layout.tsx           Root: providers, gradient bg, onboarding gate
│   ├── (tabs)/
│   │   ├── _layout.tsx       Glass tab bar (BlurView) — Home + Settings
│   │   ├── index.tsx         Hero card pattern + designed empty state
│   │   └── settings.tsx      "Re-open onboarding" entry, theme info
│   └── onboarding.tsx        Routes onto src/onboarding/OnboardingFlow
│
└── src/
    ├── theme/                Design tokens (Calm-inspired Midnight Aurora)
    │   ├── tokens.ts         Canonical aggregator
    │   ├── colors.ts         Semantic color tokens
    │   ├── type.ts           Typography scale + weights
    │   ├── spacing.ts        8pt grid
    │   ├── radius.ts
    │   ├── shadows.ts        card / sheet / modal / glow
    │   ├── motion.ts         Springs + transitions
    │   └── index.ts          useTheme() hook + everything re-exported
    │
    ├── components/           5 primitives the rulebook calls for
    │   ├── Card.tsx          Calm card with MotiView entry
    │   ├── GlassSheet.tsx    4-part glass stack (blur + tint + border + highlight)
    │   ├── GradientButton.tsx Pill, accent gradient, press-spring, haptic
    │   ├── EmptyState.tsx    Icon + headline + subtitle + primary CTA
    │   └── Skeleton.tsx      Shimmer loader (honors reduced-motion)
    │
    ├── data/
    │   └── index.ts          Zustand persist + AsyncStorage (the data layer)
    │
    └── onboarding/
        └── OnboardingFlow.tsx 3-step skippable, persisted flag
```

## How the agent uses it

The agent's prime directive is to **start every project from this template
and customize**. Steps:

1. Copy the entire `templates/golden-starter/` into the project workspace
2. Adjust `app.json` (name, slug, bundle id) per the user's spec
3. Edit `app/(tabs)/index.tsx` to render the domain-specific main screen
4. Add domain entities to `src/data/` (e.g. `habit-store.ts`, `recipe-store.ts`)
5. Replace `src/onboarding/OnboardingFlow.tsx` step copy with domain-specific welcome
6. Run reviewer subagents to confirm the quality gates pass

## What the quality gates check (Hooks 11–15)

| Hook | Checks against this template |
|---|---|
| 11 visual-polish | Gradient bg ✓, MotiView entry ✓, withSpring ✓, Haptics ✓, accent color ✓, shadow ✓, ≥2 font weights ✓ |
| 12 persistence | Zustand persist + AsyncStorage in `src/data/index.ts` ✓, no hardcoded data arrays ✓, named storage key ✓ |
| 13 domain-fitness | Empty until the agent adds domain content (per recipe in `frontend-app-design` skill) |
| 14 spec-card | Independent of template — agent emits the spec card before scaffolding |
| 15 onboarding | `OnboardingFlow.tsx` exists ✓, persisted flag ✓, Skip affordance ✓, re-openable from settings ✓ |

## Customization rules

- `src/theme/` is the **only** styling source. Components import from `'../theme'`.
- Add domain entities to `src/data/` as new slice files. Re-export from `index.ts`.
- Tab screens go under `app/(tabs)/`. Modals use Stack `presentation: 'modal'`.
- Add CTAs ALWAYS open a state-driven sheet/modal — never a separate route.
- Run the verification script before declaring done:
  ```sh
  bash .kiro/scripts/verify-app.sh
  ```
