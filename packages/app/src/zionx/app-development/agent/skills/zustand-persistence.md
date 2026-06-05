---
name: zustand-persistence
description: Load BEFORE writing any data store. Defines the canonical zustand + persist + AsyncStorage pattern, named storage keys, migration rules, and forbids hardcoded data arrays in screens.
---

# Zustand persistence — the canonical data layer

Every generated app has ONE persisted store per domain entity. The store
lives in `src/data/` and is the only place screens read/write state. Hook 12
(persistence-auditor) verifies the four rules below. If any fail, the build
is rejected.

## The four hard rules

1. **One data-access module** — `src/data/index.ts` re-exports every store.
   Screens import from `'../data'`, never directly from a store file.
2. **Persist middleware + AsyncStorage** — every store uses
   `persist(creator, { storage: createJSONStorage(() => AsyncStorage) })`.
3. **Named storage key** — every persist call passes an explicit
   `name: '<app>-<entity>-v1'` (versioned). No default names.
4. **No hardcoded user-data arrays in screens** — the regex
   `const \w+(?:Data|Items|List) = \[ *\{` is BANNED inside `app/` and
   `components/`. Seed arrays are ONLY allowed in `src/data/` files named
   `SEED_*`, `INITIAL_*`, or `DEFAULT_*`.

## The canonical store shape

```ts
// src/data/habit-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: string;       // ISO date
  completions: string[];   // ISO dates
}

interface HabitStore {
  habits: Habit[];
  add: (input: Omit<Habit, 'id' | 'createdAt' | 'completions'>) => void;
  remove: (id: string) => void;
  toggleToday: (id: string) => void;
  reset: () => void;
}

const SEED_HABITS: Habit[] = [
  { id: 'water',  name: 'Drink water',     emoji: '💧', color: '#4FB7E5', createdAt: new Date().toISOString(), completions: [] },
  { id: 'walk',   name: 'Walk 10k steps',  emoji: '👟', color: '#5FB682', createdAt: new Date().toISOString(), completions: [] },
  { id: 'read',   name: 'Read 20 minutes', emoji: '📚', color: '#E8B58A', createdAt: new Date().toISOString(), completions: [] },
];

export const useHabits = create<HabitStore>()(
  persist(
    (set) => ({
      habits: SEED_HABITS,
      add: (input) =>
        set((s) => ({
          habits: [...s.habits, { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), completions: [] }],
        })),
      remove: (id) => set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      toggleToday: (id) =>
        set((s) => {
          const today = new Date().toISOString().slice(0, 10);
          return {
            habits: s.habits.map((h) =>
              h.id !== id ? h : {
                ...h,
                completions: h.completions.includes(today)
                  ? h.completions.filter((d) => d !== today)
                  : [...h.completions, today],
              },
            ),
          };
        }),
      reset: () => set({ habits: [] }),
    }),
    {
      name: 'habits-storage-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
```

## Migration rules (when the entity shape changes)

```ts
{
  name: 'habits-storage-v2',
  version: 2,
  migrate: (persisted: any, version) => {
    if (version === 1) {
      // v1 had no `color` field — fill in a default
      return { ...persisted, habits: persisted.habits.map((h: any) => ({ ...h, color: h.color ?? '#A78BFA' })) };
    }
    return persisted;
  },
}
```

## Performance: `useShallow` to avoid unnecessary re-renders

```ts
import { useShallow } from 'zustand/shallow';

const { habits, add } = useHabits(useShallow((s) => ({ habits: s.habits, add: s.add })));
```

## Forbidden patterns (Hook 12 will fail the build)

```ts
// ❌ Hardcoded array driving a list — no.
const habitData = [
  { id: 1, name: 'Water' },
  { id: 2, name: 'Walk' },
];
return <FlatList data={habitData} ... />;

// ❌ Local state instead of a store — won't survive reload.
const [habits, setHabits] = useState([]);

// ❌ Creating a store inline in a screen — no.
const useScreenStore = create(...);

// ❌ Default storage name (collisions across apps) — no.
persist(creator, { storage: ... })  // missing `name`
```

## First-launch seeding rules

- Seed arrays MAY exist inside `src/data/` files when named `SEED_*`,
  `INITIAL_*`, or `DEFAULT_*`. They are the ONLY exception.
- Seed data must reference the domain. NO Lorem Ipsum. NO "Habit 1".
- Seeds are 3–5 items max — enough to demo, not enough to feel bloated.

## Onboarding flag (persisted in the same store)

Every app has a `hasCompletedOnboarding` flag living in the same persist
store as core state. The app routes to `OnboardingFlow` when the flag is
`false`, then sets it to `true` on completion. The flag survives reload
because it lives in the persist store. Hook 15 verifies this.

```ts
// src/data/index.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useAppCore = create<{ hasCompletedOnboarding: boolean; complete: () => void }>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      complete: () => set({ hasCompletedOnboarding: true }),
    }),
    { name: 'app-core-v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
```

## Self-check (run before declaring done)

- [ ] One module re-exports every store?
- [ ] Persist middleware + AsyncStorage on every store?
- [ ] Named version-prefixed storage key?
- [ ] No hardcoded user-data arrays in `app/` or `components/`?
- [ ] Seed arrays live ONLY in `src/data/` and are named `SEED_*`?
- [ ] Migration function present if the entity shape evolves?
- [ ] `hasCompletedOnboarding` flag in the persist store?
