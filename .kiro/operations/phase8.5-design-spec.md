# Phase 8.5: Code Generator Quality Upgrade — Design Spec

> Every app produced by the ZionX factory must look like it was designed by a team
> that studied Calm, Arc Search, and Linear. Not "inspired by" — at that level.

Last updated: 2026-05-22

---

## Reference Apps

- **Calm**: Motion timing, emotional pacing, atmospheric color. Every transition feels intentional. Whitespace is generous. The app breathes.
- **Arc Search**: Motion-first navigation. AI-integrated UX. Every interaction has spring physics. Tab bar is a design statement.
- **Linear**: Layout precision, enterprise polish, perfect spacing. Dark mode done right. Typography hierarchy is flawless. Cards have depth without weight.

---

## Visual Quality Bar — 11 Dimensions

Every generated app must satisfy ALL of these:

| # | Dimension | What "passing" looks like |
|---|-----------|--------------------------|
| 1 | Layout systems | Clear grid with intentional whitespace. Content never touches screen edges. Minimum 16px horizontal padding. Sections separated by 32-48px vertical space. |
| 2 | Motion timing | Spring physics on all transitions (not linear easing). Screen entries use gentle spring. Button presses use snappy spring. No jarring cuts. |
| 3 | Spacing rhythms | Consistent 4pt grid. Only values from the spacing scale (4/8/12/16/24/32/48/64). No arbitrary pixel values. |
| 4 | Card depth | Subtle layered shadows (Level 1 or 2). Never harsh drop shadows. Cards float above background without looking detached. |
| 5 | Blur layers | Glass morphism for overlays, modals, and tab bars. BlurView with tint. Creates depth without opacity hacks. |
| 6 | Color hierarchy | Max 2-3 primary colors from a curated palette + tonal variations. No random hex values. Every color has a semantic name. |
| 7 | Navigation structure | Bottom tab bar (3-5 tabs) for multi-section apps. Blur background on tab bar. Smooth transitions between tabs. Stack for detail screens. |
| 8 | State transitions | Every state change animated. List items enter with stagger. Screens fade+slide. Buttons scale on press. Nothing appears instantly. |
| 9 | Empty states | Phosphor icon (duotone, 96px) inside animated Skia gradient circle + headline + helper text + CTA. Never just "No items yet" as plain text. |
| 10 | Skeleton loaders | Pulse animation on placeholder shapes matching content layout. Never a centered spinner. |
| 11 | Haptic pacing | Light impact on selections/taps. Medium on confirmations/success. Heavy on destructive actions only. Never on scroll. |

---

## Required Dependencies

| Library | SDK 54 Version | Native Build | Description |
|---------|---------------|--------------|-------------|
| `react-native-reanimated` | `~4.1.0` | Yes (bundled with SDK 54) | Spring physics, layout animations, shared transitions |
| `expo-linear-gradient` | `~14.0.0` | Yes (Expo module) | Gradient backgrounds, cards, headers |
| `expo-blur` | `~14.0.0` | Yes (Expo module) | Glass morphism for modals, tab bars, overlays |
| `react-native-gesture-handler` | `~2.24.0` | Yes (bundled with SDK 54) | Swipe, drag, pinch gestures for sheets |
| `expo-haptics` | `~14.0.0` | Yes (Expo module) | Tactile feedback on interactions |
| `moti` | `^0.30.0` | No (JS only, uses Reanimated) | Simplified animation API for common patterns |
| `@shopify/flash-list` | `^2.0.0` | No (JS only) | Performant list rendering, replaces FlatList |
| `react-native-svg` | `~15.11.0` | Yes (bundled with SDK 54) | SVG rendering for icons and shapes |
| `@expo-google-fonts/inter` | `^0.3.0` | No (JS only) | Inter font family — modern, readable, professional |
| `expo-image` | `~2.0.0` | Yes (Expo module) | Blur hash placeholders, smooth transitions, caching |
| `phosphor-react-native` | `^2.2.0` | No (JS only, uses react-native-svg) | 6000+ icons, duotone weight, semantic naming |
| `@shopify/react-native-skia` | `^1.8.0` | Yes (requires RN ≥0.79) | GPU-accelerated graphics: gradient circles, mesh gradients, blur effects |
| `@expo/vector-icons` | `^14.0.0` | Yes (bundled) | Fallback icon library (Ionicons for tab bar) |

All libraries work on both iOS and Android. All are compatible with EAS Build (managed workflow).

**Removed from consideration:**
- `@gorhom/bottom-sheet` — incompatible with Reanimated v4 (SDK 54). Replaced with custom Sheet.tsx.
- `lottie-react-native` — unnecessary complexity. Empty states use Phosphor icons + Skia gradients instead.

---

## Design Tokens — Color Palettes

The LLM picks ONE palette based on app domain. Does not invent colors.

### Palette 1: "Serene" (Calm-inspired)

```
primary: #4A6FA5    (muted blue)
accent: #7BA7BC     (soft teal)
bg: #F7F9FC         (off-white)
surface: #FFFFFF
text-primary: #1A2332
text-secondary: #6B7C8F
border: #E8EDF2
success: #4CAF82
warning: #E8A838
error: #D64545
```

Best for: meditation, wellness, journaling, sleep, reading

### Palette 2: "Focus" (Linear-inspired)

```
primary: #5E6AD2    (electric purple)
accent: #00B8D4     (cyan)
bg: #0D0E14         (deep dark)
surface: #1A1D29
text-primary: #FFFFFF
text-secondary: #B4B8C5
border: #2A2E3B
success: #4ADE80
warning: #FBBF24
error: #F87171
```

Best for: productivity, dev tools, dashboards, task management

### Palette 3: "Vital" (energy-forward)

```
primary: #FF6B35    (vibrant orange)
accent: #F7B801     (warm yellow)
bg: #FFFAF6         (warm white)
surface: #FFFFFF
text-primary: #2D1810
text-secondary: #8B6F5F
border: #F0E6DE
success: #22C55E
warning: #F59E0B
error: #DC2626
```

Best for: fitness, food, social, health tracking, cooking

### Palette 4: "Modern" (versatile default)

```
primary: #000000
accent: #6366F1     (indigo)
bg: #FAFAFA
surface: #FFFFFF
text-primary: #0A0A0A
text-secondary: #525252
border: #E5E5E5
success: #10B981
warning: #F59E0B
error: #EF4444
```

Best for: business, finance, generic SaaS, utilities, notes

---

## Design Tokens — Typography

Font: **Inter** (via `@expo-google-fonts/inter`)

| Token | Size | Weight | Line Height |
|-------|------|--------|-------------|
| display-xl | 40px | 700 | 48px |
| display-lg | 32px | 700 | 40px |
| display-md | 24px | 600 | 32px |
| body-lg | 17px | 400 | 24px |
| body-md | 15px | 400 | 22px |
| body-sm | 13px | 400 | 18px |
| caption | 11px | 500 | 14px |
| button | 15px | 600 | 20px |

---

## Design Tokens — Spacing

4pt grid system. Use ONLY these values:

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 12px |
| base | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |
| 3xl | 64px |

---

## Design Tokens — Motion

Spring presets (Reanimated `withSpring`):

| Preset | Config | Use Case |
|--------|--------|----------|
| gentle | `{ damping: 18, stiffness: 90 }` | Screen entries, large elements |
| snappy | `{ damping: 22, stiffness: 220 }` | Button presses, tab switches |
| bouncy | `{ damping: 14, stiffness: 180 }` | Playful elements, success states |

Default non-spring duration: 250ms
Easing: `Easing.bezier(0.4, 0, 0.2, 1)` (Material standard curve)

---

## Design Tokens — Shadows / Depth

### Level 1 (subtle — list items, input fields)
```
iOS: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }
Android: elevation: 2
```

### Level 2 (card — content cards, sections)
```
iOS: { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }
Android: elevation: 4
```

### Level 3 (modal — floating sheets, popovers)
```
iOS: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }
Android: elevation: 8
```

---

## Required Folder Structure

Every generated app must have:

```
app/                        # expo-router screens
  _layout.tsx               # root layout (tabs + stack)
  (tabs)/                   # tab group
    _layout.tsx             # tab bar configuration
    index.tsx               # first tab (home)
    ...                     # other tabs
components/                 # shared UI components
  ui/                       # primitives
    Button.tsx              # 3 variants: primary, secondary, ghost
    Card.tsx                # shadow + rounded corners
    Sheet.tsx               # bottom sheet (custom Reanimated v4)
    Skeleton.tsx            # pulse animation loader
    EmptyState.tsx          # Phosphor icon + Skia gradient + text + CTA
theme/                      # design tokens
  colors.ts                 # palette export
  typography.ts             # type scale export
  spacing.ts                # spacing scale export
  motion.ts                 # animation presets
  shadows.ts                # depth tokens
hooks/                      # custom hooks
  useHaptics.ts             # haptic feedback helper
store/                      # zustand stores
```

---

## Required Screen Patterns

Every screen must have:

1. **Loading state**: Skeleton loader matching content layout (pulse animation via Moti)
2. **Empty state**: Phosphor icon (duotone) inside Skia gradient circle + headline + helper text + CTA
3. **Error state**: Friendly message + retry CTA (not a red error box)
4. **Pull-to-refresh**: Where data is fetched (RefreshControl with custom tint)
5. **Entry animation**: Fade + slide up with gentle spring (via Moti `from` / `animate`)

---

## Required Component Patterns

**Modal/Sheet**: Bottom sheet with blurred backdrop (`expo-blur`), spring entry animation, drag-to-dismiss gesture. Never `Alert.alert` for confirmations.

**Button**: Three variants (primary filled, secondary outlined, ghost text-only). Haptic feedback on press (`expo-haptics` light impact). Scale animation (0.96) on press-in via Reanimated.

**Card**: Level 1 or 2 shadow. 16px padding default. Rounded 16px corners. Background is `surface` color from palette.

**List**: `FlashList` from `@shopify/flash-list`. Separators are 8px vertical gaps (not lines). Items enter with stagger animation on first load.

**Image**: Use `expo-image` with `placeholder` (blur hash) and `transition` (300ms crossfade).

---

## Navigation

**Default**: Bottom tab bar (3-5 tabs) if app has 3+ distinct sections. Stack-only if app is single-purpose (timer, calculator, single-screen tool).

**Tab bar configuration**:
- Blur background via `expo-blur` (intensity 80, tint based on palette)
- Icons from `phosphor-react-native` (weight "bold", size 24)
- Haptic feedback on tab tap (light impact)
- Active state: primary color + subtle scale animation
- Position: absolute bottom, transparent background with blur

---

## Anti-Patterns (NEVER generate these)

| Bad Pattern | Required Alternative |
|-------------|---------------------|
| `Alert.alert` for confirmations | Custom Sheet.tsx with blur backdrop |
| `ActivityIndicator` as primary loading | Skeleton loader with Moti pulse |
| Plain text empty states | EmptyState.tsx (Phosphor icon + Skia gradient + headline + helper + CTA) |
| System default font | Inter via `@expo-google-fonts/inter` |
| Hardcoded colors not in palette | Token from `theme/colors.ts` |
| Hardcoded spacing not on 4pt grid | Token from `theme/spacing.ts` |
| Linear easing / `Animated.timing` | Spring via Reanimated or Moti |
| `FlatList` for long lists | `FlashList` from `@shopify/flash-list` |
| Stack-only navigation for multi-section apps | Bottom tabs with blur bar |
| Inline styles | `StyleSheet.create` with token references |
| `Image` from react-native | `Image` from `expo-image` |
| `@expo/vector-icons` Ionicons for UI icons | `phosphor-react-native` (duotone weight) |
| React Native Modal | Custom Sheet.tsx (Reanimated v4 + Gesture Handler) |
| Custom gradient implementations | `expo-linear-gradient` or Skia `LinearGradient` |

---

## Empty State Component Contract

File: `components/ui/EmptyState.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { Button } from './Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { IconProps } from 'phosphor-react-native';

interface EmptyStateProps {
  icon: React.ComponentType<IconProps>;
  headline: string;
  helper: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function EmptyState({ icon: Icon, headline, helper, ctaLabel, onCtaPress }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.illustrationContainer}>
        <Canvas style={styles.canvas}>
          <Circle cx={80} cy={80} r={80}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(160, 160)}
              colors={[`${colors.accent}33`, `${colors.primary}33`]}
            />
          </Circle>
        </Canvas>
        <MotiView
          style={styles.iconOverlay}
          from={{ scale: 0.97 }}
          animate={{ scale: 1.0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 90, loop: true, repeatReverse: true }}
        >
          <Icon size={96} weight="duotone" color={colors.accent} />
        </MotiView>
      </View>
      <Text style={styles.headline}>{headline}</Text>
      <Text style={styles.helper}>{helper}</Text>
      {ctaLabel && onCtaPress && (
        <View style={styles.ctaContainer}>
          <Button variant="primary" label={ctaLabel} onPress={onCtaPress} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing['2xl'] },
  illustrationContainer: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  canvas: { position: 'absolute', width: 160, height: 160 },
  iconOverlay: { position: 'absolute', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  headline: { ...typography.displayMd, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.xl },
  helper: { ...typography.bodyMd, color: colors.textSecondary, textAlign: 'center', maxWidth: 280, marginTop: spacing.sm },
  ctaContainer: { marginTop: spacing.lg },
});
```

---

## Semantic Icon Mapping

When generating an EmptyState, pick the Phosphor icon by semantic match:

| Context | Phosphor Icon Name |
|---------|-------------------|
| Empty journal / notes | `Notebook` |
| Empty tasks / to-do | `CheckSquare` |
| Empty inbox / messages | `PaperPlaneTilt` |
| Empty calendar / no events | `CalendarBlank` |
| Empty search results | `MagnifyingGlass` |
| Empty favorites / saved | `Heart` |
| Empty workout history | `Barbell` |
| Empty meal log / recipes | `ForkKnife` |
| Empty photos / gallery | `Camera` |
| Empty contacts / people | `Users` |
| Empty cart / shopping | `ShoppingCart` |
| Welcome / first launch | `HandWaving` |
| Success / completion | `CheckCircle` |
| Error / something wrong | `Warning` |
| Meditation / wellness | `Lotus` |
| Generic fallback | `Sparkle` |

---

## Skia Gradient Background Pattern

Used for: empty state illustration backgrounds, hero card backgrounds, premium UI moments.

Reference implementation (the LLM copies this verbatim):

```typescript
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';

interface GradientCircleProps {
  size: number;
  accentColor: string;
  primaryColor: string;
}

function GradientCircle({ size, accentColor, primaryColor }: GradientCircleProps) {
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(size, size)}
          colors={[`${accentColor}33`, `${primaryColor}33`]}
        />
      </Circle>
    </Canvas>
  );
}
```

Note: `${color}33` = color at 20% alpha (hex 33 ≈ 20% of 255).

---

## Bottom Sheet Pattern (Custom — Reanimated v4)

File: `components/ui/Sheet.tsx`

Custom implementation required because `@gorhom/bottom-sheet` is incompatible with Reanimated v4.

```typescript
import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPRING_CONFIG = { damping: 18, stiffness: 90 };

interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  snapPoint?: number; // percentage of screen height (default 50)
  children: React.ReactNode;
}

export function Sheet({ visible, onDismiss, snapPoint = 50, children }: SheetProps) {
  const sheetHeight = (SCREEN_HEIGHT * snapPoint) / 100;
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const context = useSharedValue(0);

  useEffect(() => {
    translateY.value = withSpring(
      visible ? SCREEN_HEIGHT - sheetHeight : SCREEN_HEIGHT,
      SPRING_CONFIG,
    );
    backdropOpacity.value = withSpring(visible ? 1 : 0, SPRING_CONFIG);
  }, [visible, sheetHeight]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = translateY.value;
    })
    .onUpdate((event) => {
      const newY = context.value + event.translationY;
      translateY.value = Math.max(newY, SCREEN_HEIGHT - sheetHeight);
    })
    .onEnd((event) => {
      if (event.translationY > sheetHeight * 0.3) {
        translateY.value = withSpring(SCREEN_HEIGHT, SPRING_CONFIG, (finished) => {
          'worklet';
          if (finished) {
            runOnJS(onDismiss)();
          }
        });
      } else {
        translateY.value = withSpring(SCREEN_HEIGHT - sheetHeight, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <>
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
          <View style={styles.handle} />
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 101,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
});
```

---

## Prompt Strategy

The system prompt will include:
1. All design tokens (verbatim from this spec)
2. The folder structure requirement
3. The component patterns
4. The anti-patterns list
5. One complete example screen (~80 lines) showing the quality bar
6. Instruction to pick palette based on app domain

The prompt does NOT include:
- Multiple options ("you can use X or Y")
- Flexibility language ("consider using", "optionally")
- The word "simple" anywhere

Every instruction is a directive. The LLM has no design decisions to make — only implementation decisions.
