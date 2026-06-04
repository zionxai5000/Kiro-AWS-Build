import { describe, it, expect, beforeEach } from 'vitest';
import { run, detectDomain, HOOK_METADATA } from '../13-domain-fitness-auditor.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';

function ctx(): HookContext {
  return { executionId: 't', projectId: 'p', log: () => {}, metric: () => {}, dryRun: false } as unknown as HookContext;
}

describe('Hook 13: Domain Fitness Auditor', () => {
  beforeEach(() => {
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['domain-fitness-auditor'] = { enabled: true, dryRun: false };
  });

  describe('detectDomain', () => {
    it('identifies habit', () => expect(detectDomain('Build a habit tracker with streaks')).toBe('habit'));
    it('identifies todo', () => expect(detectDomain('Build a todo list with swipe to delete')).toBe('todo'));
    it('identifies recipe', () => expect(detectDomain('Build a recipe manager with photos')).toBe('recipe'));
    it('identifies workout', () => expect(detectDomain('Build a workout log with sets and reps')).toBe('workout'));
    it('identifies game', () => expect(detectDomain('Build a tic-tac-toe game')).toBe('game'));
    it('identifies journal', () => expect(detectDomain('Build a journal with mood tracking')).toBe('journal'));
    it('falls back to generic', () => expect(detectDomain('Build something cool')).toBe('generic'));
  });

  describe('habit checks', () => {
    const goodHabit = `
      import { Pressable, Text } from 'react-native';
      function HabitCard() {
        const toggle = () => {};
        return (
          <Pressable onPress={() => toggle()}>
            <Text>streak: 5 days</Text>
            <Text>+ Add Habit</Text>
          </Pressable>
        );
      }
    `;
    const badHabit = `
      import { Text } from 'react-native';
      function Screen() { return <Text>Hello</Text>; }
    `;

    it('passes when streak + add + tap-complete present', async () => {
      const r = await run({ projectId: 'p', prompt: 'habit tracker', files: { 'app/index.tsx': goodHabit } }, ctx());
      expect(r.data!.domain).toBe('habit');
      // Won't be 100 because no calendar, but hard-fail items pass.
      const hardFails = r.data!.score.failedChecks.filter((c) => c.hardFail);
      expect(hardFails.length).toBe(0);
    });

    it('fails when habit screen has no streak/add/complete', async () => {
      const r = await run({ projectId: 'p', prompt: 'habit tracker', files: { 'app/index.tsx': badHabit } }, ctx());
      expect(r.data!.score.passed).toBe(false);
      expect(r.data!.score.failedChecks.find((c) => c.id === 'streak-rendered')).toBeDefined();
    });
  });

  describe('game checks', () => {
    const goodGame = `
      import { Pressable, Modal, Dimensions } from 'react-native';
      const { width } = Dimensions.get('window');
      function Game() {
        return (
          <>
            <Pressable onPress={() => {}}>Reset</Pressable>
            <Modal visible={true}>Winner!</Modal>
          </>
        );
      }
    `;
    const badGame = `
      import { Alert, Pressable } from 'react-native';
      function Game() {
        const onWin = () => Alert.alert('You won');
        return <Pressable onPress={onWin}>Play</Pressable>;
      }
    `;

    it('passes a game with custom modal + reset', async () => {
      const r = await run({ projectId: 'p', prompt: 'tic-tac-toe game', files: { 'app/game.tsx': goodGame } }, ctx());
      expect(r.data!.domain).toBe('game');
      const hardFails = r.data!.score.failedChecks.filter((c) => c.hardFail);
      expect(hardFails.length).toBe(0);
    });

    it('fails a game using Alert.alert for win', async () => {
      const r = await run({ projectId: 'p', prompt: 'game', files: { 'app/game.tsx': badGame } }, ctx());
      expect(r.data!.score.passed).toBe(false);
      expect(r.data!.score.failedChecks.find((c) => c.id === 'no-alert-modal')).toBeDefined();
    });
  });

  it('has correct metadata', () => {
    expect(HOOK_METADATA.id).toBe('domain-fitness-auditor');
  });
});
