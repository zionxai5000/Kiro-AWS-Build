import { describe, it, expect, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../12-persistence-auditor.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';

function createCtx(): HookContext {
  return {
    executionId: 't',
    projectId: 'p',
    log: () => {},
    metric: () => {},
    dryRun: false,
  } as unknown as HookContext;
}

const GOOD_STORE = `
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
export const useHabits = create(persist(
  (set) => ({ habits: [], add: (h) => set((s) => ({ habits: [...s.habits, h] })) }),
  { name: 'habits-storage', storage: createJSONStorage(() => AsyncStorage) },
));
`;

const BAD_STORE = `
import { create } from 'zustand';
export const useHabits = create((set) => ({ habits: [], add: (h) => set({}) }));
`;

const GOOD_SCREEN = `
import { useHabits } from '../store/habit-store';
export default function Screen() {
  const habits = useHabits((s) => s.habits);
  return null;
}
`;

const HARDCODED_SCREEN = `
const habitsData = [
  { name: 'Drink water', emoji: '💧' },
  { name: 'Walk', emoji: '🚶' },
];
export default function Screen() { return null; }
`;

describe('Hook 12: Persistence Auditor', () => {
  beforeEach(() => {
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['persistence-auditor'] = { enabled: true, dryRun: false };
  });

  it('passes when zustand persist + AsyncStorage are wired correctly', async () => {
    const r = await run({
      projectId: 'p',
      files: { 'store/habit-store.ts': GOOD_STORE, 'app/index.tsx': GOOD_SCREEN },
    }, createCtx());
    expect(r.data!.score.passed).toBe(true);
    expect(r.data!.score.total).toBe(100);
  });

  it('fails when persist middleware is missing', async () => {
    const r = await run({
      projectId: 'p',
      files: { 'store/habit-store.ts': BAD_STORE, 'app/index.tsx': GOOD_SCREEN },
    }, createCtx());
    expect(r.data!.score.passed).toBe(false);
    expect(r.data!.score.failedChecks.find((c) => c.id === 'zustand-persist-imported')).toBeDefined();
  });

  it('fails when a screen has hardcoded user-data arrays', async () => {
    const r = await run({
      projectId: 'p',
      files: { 'store/habit-store.ts': GOOD_STORE, 'app/index.tsx': HARDCODED_SCREEN },
    }, createCtx());
    expect(r.data!.score.passed).toBe(false);
    expect(r.data!.score.failedChecks.find((c) => c.id === 'no-hardcoded-user-data')).toBeDefined();
  });

  it('has correct hook metadata', () => {
    expect(HOOK_METADATA.id).toBe('persistence-auditor');
  });
});
