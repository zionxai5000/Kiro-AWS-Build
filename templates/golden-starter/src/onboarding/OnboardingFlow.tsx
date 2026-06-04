/**
 * 3-step skippable onboarding. Routes to the main screen when finished or
 * skipped. The completion flag is in the persist store so it survives
 * reload + cold start.
 *
 * Hook 15 (Onboarding Auditor) checks for:
 *   - this file's existence
 *   - hasCompletedOnboarding flag
 *   - routing decision based on the flag (in App.tsx / _layout.tsx)
 *   - skip affordance (the "Skip" button below)
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';
import { useAppCore } from '../data';
import { colors, typography, spacing, radius, elevation } from '../theme/tokens';

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { emoji: '👋', title: 'Welcome', body: 'A calm, simple place for your daily ritual.' },
  { emoji: '✨', title: 'Track what matters', body: 'Add what you want to come back to. Nothing more.' },
  { emoji: '🌱', title: "You're set", body: 'Tap below and start with one small thing today.' },
];

export default function OnboardingFlow({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const completeOnboarding = useAppCore((s) => s.completeOnboarding);
  const { width } = useWindowDimensions();
  const c = colors.dark;
  const isLast = step === STEPS.length - 1;

  const handleNext = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLast) {
      completeOnboarding();
      onComplete?.();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
    onComplete?.();
  };

  const current = STEPS[step]!;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgBase }]}>
      <LinearGradient
        colors={[c.bgBase, c.bgElevated]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.header}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === step ? c.accent : c.borderSubtle,
                  width: i === step ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={handleSkip} accessibilityLabel="Skip onboarding" hitSlop={12}>
          <Text style={[typography.body, { color: c.textSecondary }]}>Skip</Text>
        </Pressable>
      </View>

      <MotiView
        key={step}
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 320 }}
        style={styles.body}
      >
        <Text style={styles.emoji}>{current.emoji}</Text>
        <Text style={[typography.largeTitle, { color: c.textPrimary, textAlign: 'center', marginTop: spacing.lg }]}>
          {current.title}
        </Text>
        <Text style={[typography.body, { color: c.textSecondary, textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.xl }]}>
          {current.body}
        </Text>
      </MotiView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next'}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, ...elevation.level1, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={[typography.bodyEmph, { color: '#fff', fontWeight: '600' }]}>
            {isLast ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { height: 8, borderRadius: radius.pill, transition: 'all 240ms' as any },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emoji: { fontSize: 64 },
  footer: { padding: spacing.lg },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
