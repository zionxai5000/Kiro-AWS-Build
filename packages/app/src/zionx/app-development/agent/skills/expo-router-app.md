---
name: expo-router-app
description: Load BEFORE laying out screens. Defines file-based routing, the tabs+stack pattern, the state-driven Add rule, and deep-link config. Always pair with frontend-app-design.
---

# Expo Router app structure

Every generated app uses Expo Router (file-based routing) on Expo SDK 54. The
default layout is **tabs at the root**, with **screen-local stacks** inside
each tab. Modal/sheet flows are **state-driven**, never separate routes.

## File tree (canonical)

```
app/
├── _layout.tsx                  Root layout; wraps providers, theme, gradient bg
├── (tabs)/
│   ├── _layout.tsx              Tab navigator (3-5 tabs max, glass tab bar)
│   ├── index.tsx                Home / primary tab
│   ├── history.tsx              Secondary tab (if domain needs it)
│   └── settings.tsx             Settings (re-open onboarding lives here)
└── onboarding/
    └── _layout.tsx              First-launch flow (skippable, persisted flag)
```

## Root layout pattern

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAppCore } from '../src/data';
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { colors } from '../src/theme';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const hasCompletedOnboarding = useAppCore((s) => s.hasCompletedOnboarding);

  // Route to onboarding when flag is false, otherwise to (tabs).
  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';
    if (!hasCompletedOnboarding && !inOnboarding) router.replace('/onboarding');
    if (hasCompletedOnboarding && inOnboarding) router.replace('/(tabs)');
  }, [hasCompletedOnboarding, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LinearGradient
          colors={[colors.background, colors.surfaceElevated]}
          style={StyleSheet.absoluteFill}
        />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

## Tabs layout pattern

Use **glass tab bar** (BlurView background, semi-transparent tint, hairline
border). NEVER the default opaque tab bar.

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { Home, Calendar, Settings } from 'lucide-react-native';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarBackground: () => <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />,
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Today',   tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="history"  options={{ title: 'History', tabBarIcon: ({ color }) => <Calendar size={22} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings',tabBarIcon: ({ color }) => <Settings size={22} color={color} /> }} />
    </Tabs>
  );
}
```

## State-driven Add (Hook 13 enforces this)

The "+ Add X" CTA on a list screen MUST open a state-driven modal/sheet.
**Never** push a new route for the form.

```tsx
// app/(tabs)/index.tsx — RIGHT
const [addOpen, setAddOpen] = useState(false);

return (
  <>
    <FlatList ... />
    <GradientButton onPress={() => setAddOpen(true)}>+ Add habit</GradientButton>
    <AddHabitSheet open={addOpen} onClose={() => setAddOpen(false)} />
  </>
);
```

```tsx
// ❌ WRONG — separate route for form
<Link href="/add-habit">+ Add habit</Link>
```

The Hook 13 rule fired because mid-task the agent often defaults to a route
push, which on Snack web preview goes to a 404 because expo-router is
stubbed there. State-driven modals work universally.

## Deep-link / web config

```json
// app.json
{
  "expo": {
    "scheme": "zionxapp",
    "web": { "bundler": "metro" }
  }
}
```

Configure deep-links so `zionxapp://habit/<id>` opens habit detail. Use
`useLocalSearchParams()` in the dynamic route file.

## Onboarding flow (per-app, skippable, persisted)

```tsx
// app/onboarding/_layout.tsx — wraps the onboarding stack
import { Stack } from 'expo-router';
import OnboardingFlow from '../../src/onboarding/OnboardingFlow';
import { useRouter } from 'expo-router';

export default function Onboarding() {
  const router = useRouter();
  return <OnboardingFlow onComplete={() => router.replace('/(tabs)')} />;
}
```

`OnboardingFlow.tsx` lives in `src/onboarding/` (Hook 15 looks for both
locations).

## Modals via Stack `presentation: 'modal'`

For a deep-screen modal (e.g. habit detail), use:

```tsx
// app/_layout.tsx (root stack)
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="onboarding" />
  <Stack.Screen name="habit/[id]" options={{ presentation: 'modal' }} />
</Stack>
```

```tsx
// app/habit/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
const { id } = useLocalSearchParams<{ id: string }>();
```

## Self-check

- [ ] `app/_layout.tsx` wraps providers, theme, gradient bg.
- [ ] Onboarding routing wired (route to `/onboarding` when flag is false).
- [ ] Tabs use glass tab bar (BlurView), not opaque default.
- [ ] Add CTA opens a state-driven modal/sheet, not a separate route.
- [ ] Deep-link scheme registered in `app.json`.
- [ ] All screens fit native safe area insets.
