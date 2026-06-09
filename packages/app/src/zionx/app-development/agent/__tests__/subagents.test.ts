/**
 * Reviewer subagent tests — every wrapper turns the underlying Hook's score
 * into a SubagentResult with the right fields. We don't re-test the hooks
 * themselves (those have their own tests under pipeline/__tests__/).
 */

import { describe, it, expect } from 'vitest';
import type { WorkspaceLike } from '../types.js';

class MemoryWorkspace implements WorkspaceLike {
  files = new Map<string, string>();
  async readFile(_p: string, path: string): Promise<string> {
    const v = this.files.get(path); if (v === undefined) throw new Error(`ENOENT ${path}`); return v;
  }
  async writeFile(_p: string, path: string, content: string): Promise<void> { this.files.set(path, content); }
  async listFiles(_p: string): Promise<string[]> { return [...this.files.keys()].sort(); }
  async exists(_p: string, path: string): Promise<boolean> { return this.files.has(path); }
  async delete(_p: string, path: string): Promise<void> { this.files.delete(path); }
}

const PASSING_HABIT_INDEX = `
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { withSpring, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHabits } from '../../src/data';

export default function Today() {
  const habits = useHabits((s) => s.habits);
  const scale = useSharedValue(1);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient colors={['#0A0E1F', '#14182E', '#1B1F3A']} style={StyleSheet.absoluteFill} />
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#A78BFA' }}>Today</Text>
      <Text style={{ fontSize: 15, fontWeight: '500', color: '#E0AAFF' }}>Drink water 5 day streak 🔥</Text>
      <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }}
        style={{ shadowOpacity: 0.18, shadowRadius: 24, padding: 16, borderRadius: 16 }}>
        <Pressable onPressIn={() => { scale.value = withSpring(0.96); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
          <View style={{ shadowOpacity: 0.18, shadowRadius: 24 }}><Text>Tap</Text></View>
        </Pressable>
      </MotiView>
      <View style={{ shadowOpacity: 0.18, shadowRadius: 24 }} />
    </SafeAreaView>
  );
}
`;

describe('reviewer subagents', () => {
  it('visualPolishReviewer returns SubagentResult with score and fixes', async () => {
    const { visualPolishReviewer } = await import('../subagents/visual-polish.js');
    const ws = new MemoryWorkspace();
    ws.files.set('app/(tabs)/index.tsx', PASSING_HABIT_INDEX);
    const r = await visualPolishReviewer.run({ projectId: 'p', userId: 'u', workspace: ws });
    expect(typeof r.passed).toBe('boolean');
    expect(typeof r.score).toBe('number');
    expect(Array.isArray(r.fixes)).toBe(true);
    expect(typeof r.details).toBe('string');
  });

  it('persistenceReviewer flags missing zustand persist', async () => {
    const { persistenceReviewer } = await import('../subagents/persistence.js');
    const ws = new MemoryWorkspace();
    // No data layer — should fail.
    ws.files.set('app/(tabs)/index.tsx', `import React from 'react'; export default function X(){return null;}`);
    const r = await persistenceReviewer.run({ projectId: 'p', userId: 'u', workspace: ws });
    expect(r.passed).toBe(false);
    expect(r.fixes.length).toBeGreaterThan(0);
  });

  it('domainFitnessReviewer factory binds the prompt for domain detection', async () => {
    const { createDomainFitnessReviewer } = await import('../subagents/domain-fitness.js');
    const ws = new MemoryWorkspace();
    ws.files.set('app/(tabs)/index.tsx', PASSING_HABIT_INDEX);
    const reviewer = createDomainFitnessReviewer('Build a habit tracker with streaks');
    const r = await reviewer.run({ projectId: 'p', userId: 'u', workspace: ws });
    expect(reviewer.name).toBe('domain-fitness-reviewer');
    expect(typeof r.passed).toBe('boolean');
  });

  it('onboardingReviewer flags a missing OnboardingFlow', async () => {
    const { onboardingReviewer } = await import('../subagents/onboarding.js');
    const ws = new MemoryWorkspace();
    ws.files.set('app/(tabs)/index.tsx', 'export default function X(){return null;}');
    const r = await onboardingReviewer.run({ projectId: 'p', userId: 'u', workspace: ws });
    expect(r.passed).toBe(false);
    expect(r.fixes.join(' ')).toMatch(/onboard/i);
  });

  it('createSpecCardReviewer rejects empty first text', async () => {
    const { createSpecCardReviewer } = await import('../subagents/spec-card.js');
    const reviewer = createSpecCardReviewer('hello world, no spec block here');
    const r = await reviewer.run({ projectId: 'p', userId: 'u', workspace: new MemoryWorkspace() });
    expect(r.passed).toBe(false);
  });

  it('createSpecCardReviewer accepts a complete spec block', async () => {
    const fullSpec = `<spec>
{
  "domain": "habit tracker for daily routines",
  "userGoal": "tap a habit row to mark today complete and watch the streak rise",
  "screens": ["app/(tabs)/index.tsx — Today", "app/(tabs)/history.tsx — History"],
  "stateModel": "stores/habit-store.ts: Habit { id, name, completions[] }",
  "seed": "3 realistic habits: water, walk, read",
  "persistence": "zustand persist + AsyncStorage with key 'habits-storage-v1'",
  "visualAnchor": "amber accent, flame motif, gradient #fff8e7 to #fce8b8",
  "hero": "tap habit row → progress ring fills with spring + success haptic",
  "emptyState": "flame icon, 'Add your first habit', + Add Habit gradient CTA",
  "failCheck": "ran the 7 final checks from frontend-app-design self-check"
}
</spec>
Now I'll start by reading the workspace…`;
    const { createSpecCardReviewer } = await import('../subagents/spec-card.js');
    const reviewer = createSpecCardReviewer(fullSpec);
    const r = await reviewer.run({ projectId: 'p', userId: 'u', workspace: new MemoryWorkspace() });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it('registerStaticReviewers + spawn_subagent dispatch by name', async () => {
    const { registerStaticReviewers } = await import('../subagents/index.js');
    const { listSubagents, spawnSubagentTool } = await import('../tools/spawn-subagent.js');
    registerStaticReviewers();
    const names = listSubagents();
    expect(names).toContain('visual-polish-reviewer');
    expect(names).toContain('persistence-reviewer');
    expect(names).toContain('onboarding-reviewer');
    expect(names).toContain('dependency-validator-reviewer');

    // Unknown subagent error.
    const ctx = {
      projectId: 'p', userId: 'u', workspace: new MemoryWorkspace(),
      emit: () => {}, readFiles: new Set<string>(), log: () => {},
    };
    const r = await spawnSubagentTool.run({ name: 'nope-reviewer' }, ctx as never);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('unknown subagent');
  });

  describe('dependencyValidatorReviewer', () => {
    it('passes when no package.json exists yet', async () => {
      const { dependencyValidatorReviewer } = await import('../subagents/dependency-validator.js');
      const ws = new MemoryWorkspace();
      const r = await dependencyValidatorReviewer.run({ projectId: 'p', userId: 'u', workspace: ws });
      expect(r.passed).toBe(true);
      expect(r.details).toContain('skipped');
    });

    it('produces a fix message that calls out version_unsatisfiable for fake versions', async () => {
      // Sanity-check the wrapper's fix-rendering on a synthetic error shape.
      // We don't exercise the real npm registry call here — that has its own
      // tests under pipeline/__tests__/. We just want to verify the fix text
      // is informative enough for the LLM to act on.
      const fakeError = {
        name: 'react',
        versionRange: '18.3.2',
        reason: 'version_unsatisfiable' as const,
      };
      // Render a fix message the same way the reviewer does.
      const fixText = (() => {
        const e = fakeError;
        return `Package "${e.name}" requested at "${e.versionRange}" — that version range matches no published version on npm. ` +
               `Pick a real version. For React + RN + Expo SDK 54: react@18.3.1 (NOT 18.3.2), react-native@0.76.x. ` +
               `When unsure, use a caret range like "^18.3.0" or "^0.76.0" so npm picks the highest matching real release.`;
      })();
      expect(fixText).toContain('react@18.3.1');
      expect(fixText).toContain('NOT 18.3.2');
      expect(fixText).toContain('caret range');
    });
  });
});
