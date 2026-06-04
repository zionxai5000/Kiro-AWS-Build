import { describe, it, expect, beforeEach } from 'vitest';
import { run, HOOK_METADATA } from '../11-visual-polish-validator.js';
import { HOOKS_CONFIG } from '../../config/hooks.config.js';
import type { HookContext } from '../types.js';

function createCtx(): HookContext {
  return {
    executionId: 'test-1',
    projectId: 'proj-1',
    log: () => {},
    metric: () => {},
    dryRun: false,
  } as unknown as HookContext;
}

const POLISHED_SCREEN = `
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button } from '../../components/ui/Button';

export default function Today() {
  const scale = useSharedValue(1);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LinearGradient colors={['#0E1424', '#161E33', '#2A2F5C']} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#fafbff', '#f0f4ff']} style={styles.bg}>
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }}>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.sub}>Drink 8 glasses of water</Text>
          <LinearGradient colors={['#7C83FF', '#5FB6A6']} style={styles.cta}>
            <Pressable
              onPress={() => { scale.value = withSpring(0.97); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={{ fontWeight: '700', color: '#fff' }}>Mark Complete</Text>
            </Pressable>
          </LinearGradient>
          <Pressable style={styles.card}>
            <Text style={{ fontWeight: '500' }}>Settings</Text>
          </Pressable>
        </MotiView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  title: { fontSize: 32, fontWeight: '700', color: '#7C83FF' },
  sub: { fontSize: 14, fontWeight: '400', color: '#6b7080' },
  card: { backgroundColor: '#161E33', padding: 16, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 4 } },
  cta: { borderRadius: 16, shadowOpacity: 0.2, shadowRadius: 12, shadowColor: '#7C83FF' },
  hero: { borderRadius: 20, shadowOpacity: 0.18, shadowRadius: 16, shadowColor: '#000' },
});
`;

const FLAT_SCREEN = `
import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
export default function Today() {
  return (
    <View style={styles.bg}>
      <Text>Item 1</Text>
      <Text>Item 2</Text>
      <Button title="Press" onPress={() => {}} />
    </View>
  );
}
const styles = StyleSheet.create({ bg: { flex: 1, backgroundColor: '#ffffff' } });
`;

describe('Hook 11: Visual Polish Validator', () => {
  beforeEach(() => {
    HOOKS_CONFIG.globalKillSwitch = false;
    HOOKS_CONFIG.hooks['visual-polish-validator'] = { enabled: true, dryRun: false };
  });

  it('passes a polished screen above 70/100', async () => {
    const result = await run({ projectId: 'p', files: { 'app/(tabs)/index.tsx': POLISHED_SCREEN } }, createCtx());
    expect(result.success).toBe(true);
    const score = result.data!.score;
    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(score.passed).toBe(true);
  });

  it('fails a flat screen with hardFail items', async () => {
    const result = await run({ projectId: 'p', files: { 'index.tsx': FLAT_SCREEN } }, createCtx());
    expect(result.success).toBe(true);
    const score = result.data!.score;
    expect(score.passed).toBe(false);
    const hardFails = score.failedChecks.filter((c) => c.hardFail);
    expect(hardFails.length).toBeGreaterThan(0);
  });

  it('flags placeholder copy as hard fail', async () => {
    const lorem = POLISHED_SCREEN.replace('Drink 8 glasses of water', 'Lorem ipsum dolor sit amet');
    const result = await run({ projectId: 'p', files: { 'index.tsx': lorem } }, createCtx());
    expect(result.data!.score.passed).toBe(false);
    expect(result.data!.score.failedChecks.find((c) => c.id === 'no-placeholder-copy')).toBeDefined();
  });

  it('returns 100 when hook is disabled', async () => {
    HOOKS_CONFIG.hooks['visual-polish-validator'] = { enabled: false, dryRun: false };
    const result = await run({ projectId: 'p', files: { 'i.tsx': FLAT_SCREEN } }, createCtx());
    expect(result.data!.score.total).toBe(100);
    expect(result.data!.score.passed).toBe(true);
  });

  it('has correct hook metadata', () => {
    expect(HOOK_METADATA.id).toBe('visual-polish-validator');
    expect(HOOK_METADATA.failureMode).toBe('notify');
  });
});
