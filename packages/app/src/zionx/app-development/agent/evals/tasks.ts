/**
 * Eval task definitions — 18 fixed tasks covering 8 domains + iterations + fixes.
 *
 * Adding a task: append it here. The id MUST be stable across runs; CI
 * compares score-by-id against `baseline.json`.
 */

import type { EvalTask } from './types.js';

const SHARED_PREFIX = 'Build a 5-star App Store quality Expo + React Native app. Polished, beautifully designed, persistent. ';

// ---------------------------------------------------------------------------
// Seed file fixtures (declared FIRST so the TASKS array can reference them).
// ---------------------------------------------------------------------------

const TIC_TAC_TOE_INDEX = `import React from 'react';
import { View, Text, Pressable } from 'react-native';
export default function Game() {
  return (
    <View><Text>Tic Tac Toe</Text></View>
  );
}
`;

const SEED_TIC_TAC_TOE: Record<string, string> = {
  'app/(tabs)/index.tsx': TIC_TAC_TOE_INDEX,
};

const HABIT_INDEX = `import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useHabits } from '../../src/data';

export default function Habits() {
  const habits = useHabits((s) => s.habits);
  return (
    <View>
      {habits.map((h) => (<Text key={h.id}>{h.name} — {h.streak} 🔥</Text>))}
    </View>
  );
}
`;
const SEED_HABIT_TRACKER: Record<string, string> = {
  'app/(tabs)/index.tsx': HABIT_INDEX,
  'src/theme/colors.ts': `export const colors = { accent: '#F59E0B' };\n`,
};

const SEED_HABIT_TRACKER_NO_EMPTY: Record<string, string> = {
  'app/(tabs)/index.tsx': `import React from 'react';
import { View, FlatList, Text } from 'react-native';
import { useHabits } from '../../src/data';
export default function Habits() {
  const habits = useHabits((s) => s.habits);
  return <FlatList data={habits} renderItem={({item}) => <Text>{item.name}</Text>} keyExtractor={(i) => i.id} />;
}
`,
};

const SEED_BROKEN_IMPORT: Record<string, string> = {
  'app/(tabs)/index.tsx': `import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../theme/colors';  // wrong path: should be ../../src/theme/colors

export default function Home() {
  return <View style={{ backgroundColor: colors.background }}><Text>Hi</Text></View>;
}
`,
  'src/theme/colors.ts': `export const colors = { background: '#0E1424' };\n`,
};

const SEED_TYPECHECK_ERROR: Record<string, string> = {
  'app/(tabs)/index.tsx': `import React from 'react';
import { Text } from 'react-native';
type Habit = { id: string; name: string; };  // missing streak
export default function Screen() {
  const h: Habit = { id: 'a', name: 'water' };
  return <Text>{h.name} — {h.streak} 🔥</Text>;  // type error
}
`,
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASKS: ReadonlyArray<EvalTask> = [
  // ---- Domain builds (8) -------------------------------------------------
  {
    id: 'build-habit-tracker',
    description: 'Build a habit tracker with streaks',
    domain: 'habit',
    prompt: SHARED_PREFIX + 'Build a daily habit tracker. Add habits, mark complete each day, show streaks, calendar heatmap, and an Add Habit modal. 5-star App Store quality.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'domain-recipe', 'persistence'],
  },
  {
    id: 'build-todo-list',
    description: 'Build a to-do list with sections + swipe',
    domain: 'todo',
    prompt: SHARED_PREFIX + 'Build a to-do list with Today and Upcoming sections, swipe-to-delete, animated checkbox, and a state-driven Add task sheet.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'domain-recipe', 'persistence'],
  },
  {
    id: 'build-recipe-app',
    description: 'Build a recipe app with image cards',
    domain: 'recipe',
    prompt: SHARED_PREFIX + 'Build a recipe collection app. Add recipes with photo, cook time, ingredient checklist. Browse list with image cards. Save favorites.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'domain-recipe', 'persistence'],
  },
  {
    id: 'build-tic-tac-toe',
    description: 'Build a tic-tac-toe game',
    domain: 'game',
    prompt: SHARED_PREFIX + 'Build a tic-tac-toe game. 3x3 board, alternating X/O, winner detection, custom (no Alert.alert) win modal, and a reset button.',
    scorers: ['compiles', 'quality-gate', 'domain-recipe'],
  },
  {
    id: 'build-mood-journal',
    description: 'Build a mood journal',
    domain: 'journal',
    prompt: SHARED_PREFIX + 'Build a daily mood journal. Pick a mood (5 options), add a short note, see history with a calendar strip. Persistence required.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'domain-recipe', 'persistence'],
  },
  {
    id: 'build-workout-tracker',
    description: 'Build a workout tracker',
    domain: 'workout',
    prompt: SHARED_PREFIX + 'Build a workout tracker. Log sets/reps/weight, view weekly progress with an animated chart, rest timer, exercise list.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'domain-recipe', 'persistence'],
  },
  {
    id: 'build-mood-tracker',
    description: 'Build a mood tracker (different shape than journal)',
    domain: 'mood',
    prompt: SHARED_PREFIX + 'Build a daily mood tracker. Tap one of 5 emoji moods each day, see a 30-day grid heatmap of your moods, get a streak count.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'persistence'],
  },
  {
    id: 'build-generic-app',
    description: 'Build a generic small app (sanity check on the fallback path)',
    domain: 'generic',
    prompt: SHARED_PREFIX + 'Build a "things I want to remember" app. Add notes, tag them, search them. Simple but polished.',
    scorers: ['compiles', 'quality-gate', 'navigates', 'persistence'],
  },

  // ---- Iterations (3) ---------------------------------------------------
  {
    id: 'iterate-add-turn-indicator',
    description: 'Iterate on tic-tac-toe: add turn indicator',
    domain: 'iteration',
    seedFiles: SEED_TIC_TAC_TOE,
    prompt: 'Add a label at the top of the screen showing whose turn it is (X or O). Update the label as turns alternate.',
    scorers: ['compiles', 'iteration-applied'],
  },
  {
    id: 'iterate-change-color',
    description: 'Iterate: change the accent color from amber to indigo',
    domain: 'iteration',
    seedFiles: SEED_HABIT_TRACKER,
    prompt: 'Change the accent color from amber to indigo throughout the app. Update the design tokens, gradients, and primary CTA.',
    scorers: ['compiles', 'iteration-applied'],
  },
  {
    id: 'iterate-add-empty-state',
    description: 'Iterate: replace blank empty state with a designed one',
    domain: 'iteration',
    seedFiles: SEED_HABIT_TRACKER_NO_EMPTY,
    prompt: 'Replace the blank list-when-empty area with a designed empty state: flame icon, "Add your first habit" headline, encouraging subtitle, and a + Add Habit gradient CTA.',
    scorers: ['compiles', 'iteration-applied', 'quality-gate'],
  },

  // ---- Fixes (2) ---------------------------------------------------------
  {
    id: 'fix-broken-import',
    description: 'Fix: broken import path causes runtime error',
    domain: 'fix',
    seedFiles: SEED_BROKEN_IMPORT,
    prompt: 'The app crashes on startup with "Unable to resolve module ../theme/colors". Fix the import path so the app boots.',
    scorers: ['compiles', 'fix-applied'],
  },
  {
    id: 'fix-typecheck-error',
    description: 'Fix: type error blocks compile',
    domain: 'fix',
    seedFiles: SEED_TYPECHECK_ERROR,
    prompt: 'tsc reports "Property streak does not exist on type Habit" in app/(tabs)/index.tsx. Fix the type so the build compiles.',
    scorers: ['compiles', 'fix-applied'],
  },

  // ---- Edge cases (5) ----------------------------------------------------
  {
    id: 'onboarding-required',
    description: 'A new app must include OnboardingFlow + persisted flag',
    domain: 'generic',
    prompt: SHARED_PREFIX + 'Build a small app. The user must see a 3-step onboarding on first launch.',
    scorers: ['compiles', 'quality-gate', 'persistence'],
  },
  {
    id: 'persistence-survives-reload',
    description: 'A new todo app: items must survive reload',
    domain: 'todo',
    prompt: SHARED_PREFIX + 'Build a to-do app. Items must survive a kill+relaunch — no in-memory only state.',
    scorers: ['persistence', 'quality-gate'],
  },
  {
    id: 'multi-screen-navigation',
    description: 'Multi-screen app must use tabs correctly',
    domain: 'generic',
    prompt: SHARED_PREFIX + 'Build an app with 3 distinct tabs: Home, Search, Settings. Each tab does a different thing.',
    scorers: ['compiles', 'navigates', 'quality-gate'],
  },
  {
    id: 'empty-state-quality',
    description: 'Empty state can\'t be a blank screen',
    domain: 'generic',
    prompt: SHARED_PREFIX + 'Build a journal app where I write daily entries. The first-launch empty state must feel inviting.',
    scorers: ['compiles', 'quality-gate'],
  },
  {
    id: 'no-static-data',
    description: 'No hardcoded data arrays in screens',
    domain: 'generic',
    prompt: SHARED_PREFIX + 'Build a recipe collection app. All recipes must come from the persisted data layer; do NOT hardcode arrays in screens.',
    scorers: ['persistence', 'quality-gate'],
  },
] as const;
