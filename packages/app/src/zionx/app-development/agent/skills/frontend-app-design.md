---
name: frontend-app-design
description: Load BEFORE writing any screen or component. Enforces a production-grade visual bar (Linear / Arc / Calm / Apple HIG). Defines tokens, layout law, motion, per-domain recipes, and a rejection list. Customize the golden-starter — never build UI from scratch.
---

# Frontend App Design — the quality bar

You are building apps that must look like a senior product designer made them.
The enemy is the "default" look: flat colors, one font weight, no depth, no
motion, cramped spacing, lorem-ipsum copy. Every rule below exists to kill that
look.

## 0. Non-negotiables (if you do nothing else)

1. Start from `templates/golden-starter/` and CUSTOMIZE. Never write a screen
   from a blank file.
2. Every screen uses the design tokens below. Never hardcode a hex value in a
   component.
3. Every interactive element has: a pressed state, a spring animation, and (on
   device) a haptic.
4. Never ship placeholder copy ("Lorem", "Title here", "Item 1"). Write
   realistic content.
5. Minimum 2 font weights and a real type scale on every screen.
6. Every screen has: a considered empty state, a loading state, and an error
   state.

## 1. Design tokens (the system)

### Color — semantic, not raw

Define in `src/theme/colors.ts`. Pick ONE accent per app from the domain recipe.

```
background      // app canvas — subtle gradient, never pure #FFF or #000
surface         // cards / sheets
surfaceElevated // modals / popovers
border          // hairline 1px, low-opacity
textPrimary     // ~87% opacity on light, ~95% on dark
textSecondary   // ~60%
textTertiary    // ~38%
accent          // the ONE brand color — CTAs, active states
accentMuted     // tints, backgrounds of accent chips
success / warning / danger
```

**Rule: 60 / 30 / 10** — 60% neutral surfaces, 30% secondary, 10% accent.
Accent is a spice, not a base.

### Typography — `src/theme/type.ts`

Scale (pt): 32 / 28 / 22 / 17 / 15 / 13 / 11.
Weights: use at least Regular(400), Medium(500), Semibold(600); reserve
Bold(700) for hero numbers.
Line-height 1.3–1.5 body, 1.1–1.2 headings.
Letter-spacing tighten -0.2 to -0.4 on large headings.

### Spacing — 8px grid (`src/theme/spacing.ts`)

4, 8, 12, 16, 20, 24, 32, 40, 48. Screen horizontal padding = 20. Card
padding = 16. Never use arbitrary values like 7, 13, 25.

### Radius & elevation

Radius: sm 8, md 12, lg 16, xl 24, pill 999.
Shadow tiers (soft, never harsh):

- card  = y2 blur8 8% opacity
- sheet = y8 blur24 14% opacity
- modal = y16 blur40 20% opacity

## 2. Layout law

- Respect `SafeAreaView` / insets on every screen. Content never touches notch
  or home bar.
- Tab bar / bottom nav must be fully visible — never cropped.
- One primary action per screen, visually dominant. Secondary actions are
  quieter.
- Group related content into cards with radius + shadow; don't float raw text
  on the canvas.
- Vertical rhythm: 24–32 between sections, 12–16 within a section.

## 3. Depth & "glass"

Use `expo-blur` (or expo-glass) for nav bars, sheets, and floating bars:
**blurred layer + semi-transparent tint of `surface` + 1px `border` + soft
inner highlight**. That 4-part stack is what reads as glass. Transparency
alone looks cheap.

Backgrounds: a subtle 2-stop gradient (e.g. background → slightly warmer/
cooler), never flat fill.

## 4. Motion (`react-native-reanimated` + Moti)

- **Entrance**: fade + 8px upward translate,
  `withSpring({ damping: 18, stiffness: 180 })`.
- **Press**: scale to 0.96 on pressIn, spring back on pressOut.
- **List items**: stagger 30ms each on mount.
- **Transitions** cross-fade; never hard-cut.
- **Hero moments** (streak fires, task completes): a small celebratory
  animation + `Haptics.notificationAsync(Success)`.

Performance: animate on the UI thread (Reanimated worklets), never via
setState in a loop.

## 5. Haptics (`expo-haptics`) — device only, behind a settings toggle

- light tap   → selection / toggle
- medium      → primary action committed
- success     → task/goal completed
- warning     → destructive or error

Never fire haptics on scroll or on every render.

## 6. Per-domain home-screen recipes

For each common app type, follow the recipe so output isn't generic.

### Habit tracker

- Accent: warm amber/ember.
- Hero: tap a habit row → progress ring fills + flame streak count animates
  up + success haptic.
- Cards per habit with icon, name, today's progress bar, 🔥 streak.
- Empty state: friendly flame icon + "Add your first habit."
- Bottom tabs: Today / History / Settings.

### To-do / tasks

- Accent: calm indigo.
- Hero: check a task → strikethrough + fade + spring collapse.
- Sections by Today/Upcoming. Swipe to complete/delete.
- Empty: "All clear" illustration.

### Recipe app

- Accent: appetizing terracotta/green.
- Hero: large food card with image, cook time chip, save heart.
- Masonry or rich card list. Detail screen with ingredient checklist.
- Empty: "Save your first recipe."

### Tracker / stats (fitness, money, mood)

- Accent: domain-appropriate.
- Hero: an animated chart that draws on mount. Big hero number in Bold.
- Cards of recent entries.
- Empty: "Log your first entry."

### Game (tic-tac-toe, puzzle, etc.)

- Accent: playful but readable; never harsh primary blue.
- Hero: the play surface fills ≥60% of the screen, cells with depth shadows
  and accent fills, a custom win modal (NEVER `Alert.alert`), a clear reset
  affordance.
- No tabs unless the game has a separate stats screen.

### Journal / mood

- Accent: warm muted (rose, sage).
- Hero: today's entry card centered with a mood selector at top.
- Date strip across the top, calendar in a separate tab.
- Empty: "Capture how today felt."

(If the domain isn't listed: pick the closest recipe, choose a fitting
accent, and apply all the laws above.)

## 7. REJECTION LIST — never ship these

- ✗ Flat solid-color button with no shadow/gradient/press state ("flat orange
  CTA").
- ✗ Everything in one font size / one weight.
- ✗ Pure `#FFFFFF` or `#000000` backgrounds.
- ✗ Placeholder text or fake "Item 1 / Item 2".
- ✗ Cropped bottom nav or content under the notch.
- ✗ No empty/loading/error state.
- ✗ Default React Native gray, unstyled `<Button>`, or `Alert.alert` for
  primary flows.
- ✗ Cramped 4px-against-edge layouts.
- ✗ No motion anywhere (static = computer-made).

## 8. Self-check before declaring done

Run the screen against this and fix any "no":

- [ ] Tokens used (no hardcoded hex)?
- [ ] ≥2 font weights?
- [ ] Accent ≤10% of surface?
- [ ] Cards have radius + shadow?
- [ ] Safe area respected, nav uncropped?
- [ ] Entrance + press animations?
- [ ] Haptic on primary action?
- [ ] Empty + loading + error states exist?
- [ ] Realistic copy, no placeholders?
- [ ] Would a senior designer screenshot this without wincing?

## 9. Example — a "calm card" (copy the pattern, not the literal values)

```tsx
import { MotiView } from 'moti';
import { Text } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

<MotiView
  from={{ opacity: 0, translateY: 8 }}
  animate={{ opacity: 1, translateY: 0 }}
  transition={{ type: 'spring', damping: 18, stiffness: 180 }}
  style={{
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing[4],            // 16
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  }}
>
  <Text
    style={{
      fontSize: type.lg,
      fontWeight: '600',
      color: colors.textPrimary,
    }}
  >
    Drink water
  </Text>
  <Text
    style={{
      fontSize: type.sm,
      color: colors.textSecondary,
      marginTop: spacing[1],
    }}
  >
    5 day streak 🔥
  </Text>
</MotiView>
```

## 10. State-driven Add (Hook 13 mandate)

The "+ Add X" CTA on a list screen MUST open a state-driven modal or bottom
sheet. NEVER navigate to a separate route for the Add form. Hook 13's
domain-fitness auditor enforces this:

```tsx
const [addOpen, setAddOpen] = useState(false);

// CTA triggers modal, not router.push
<GradientButton onPress={() => setAddOpen(true)}>+ Add habit</GradientButton>

<AddHabitSheet open={addOpen} onClose={() => setAddOpen(false)} />
```

The sheet is a Gorhom bottom sheet OR a native React Native `Modal` styled
per this rulebook (glass background, gradient hero, primary CTA at bottom).

## 11. Final checklist (before declaring "done")

If ANY of these fail, the screen is not done:

- [ ] Loaded `frontend-app-design` (this skill) before writing.
- [ ] Started from `templates/golden-starter/`, not from a blank file.
- [ ] All literals reference tokens; no hex inside components.
- [ ] Empty / loading / error states all rendered.
- [ ] At least one MotiView/Reanimated entry per screen.
- [ ] At least one Haptics call on a primary action.
- [ ] Type scale uses at least 2 weights and 2 sizes.
- [ ] Card uses radius ≥ 12 AND a shadow.
- [ ] No placeholder text / Lorem / Item N.
- [ ] State-driven Add (modal/sheet), not a separate route.
- [ ] Self-graded ≥4.5/5 on hierarchy / spacing / typography / motion / polish.
