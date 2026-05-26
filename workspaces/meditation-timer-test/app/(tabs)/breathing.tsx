import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, AccessibilityInfo, AppState } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MotiView } from 'moti';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Wind, Play, Pause, Square } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { motion } from '../../theme/motion';
import { useAppState } from '../../hooks/useAppState';

interface BreathingPattern {
  id: string;
  name: string;
  description: string;
  inhale: number;
  hold: number;
  exhale: number;
  holdAfterExhale?: number;
}

const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: '4-7-8',
    name: '4-7-8 Relaxation',
    description: 'Calming pattern for stress relief and better sleep',
    inhale: 4,
    hold: 7,
    exhale: 8,
  },
  {
    id: 'box',
    name: 'Box Breathing',
    description: 'Equal timing for focus and concentration',
    inhale: 4,
    hold: 4,
    exhale: 4,
    holdAfterExhale: 4,
  },
  {
    id: 'deep',
    name: 'Deep Breathing',
    description: 'Simple deep breaths for quick relaxation',
    inhale: 6,
    hold: 2,
    exhale: 8,
  },
];

type BreathingPhase = 'inhale' | 'hold' | 'exhale' | 'holdAfterExhale' | 'prepare';

export default function BreathingScreen() {
  const colors = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [refreshing, setRefreshing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  
  // Breathing state
  const [selectedPattern, setSelectedPattern] = useState<BreathingPattern | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<BreathingPhase>('prepare');
  const [timeInPhase, setTimeInPhase] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  
  const { isActive: appIsActive } = useAppState();
  
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Pause breathing when app goes to background
  useEffect(() => {
    if (!appIsActive && isActive) {
      setIsActive(false);
    }
  }, [appIsActive, isActive]);

  // Breathing timer logic
  useEffect(() => {
    if (!isActive || !selectedPattern) return;

    const interval = setInterval(() => {
      setTimeInPhase((prev) => {
        const currentPhaseDuration = getCurrentPhaseDuration();
        
        if (prev >= currentPhaseDuration - 1) {
          // Move to next phase
          setCurrentPhase((currentPhase) => {
            if (currentPhase === 'prepare') return 'inhale';
            if (currentPhase === 'inhale') return 'hold';
            if (currentPhase === 'hold') return 'exhale';
            if (currentPhase === 'exhale') {
              if (selectedPattern.holdAfterExhale) return 'holdAfterExhale';
              // Complete cycle
              setCycleCount(c => c + 1);
              return 'inhale';
            }
            if (currentPhase === 'holdAfterExhale') {
              // Complete cycle
              setCycleCount(c => c + 1);
              return 'inhale';
            }
            return 'inhale';
          });
          return 0;
        }
        
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, selectedPattern, currentPhase]);

  const getCurrentPhaseDuration = (): number => {
    if (!selectedPattern) return 0;
    
    switch (currentPhase) {
      case 'prepare': return 3;
      case 'inhale': return selectedPattern.inhale;
      case 'hold': return selectedPattern.hold;
      case 'exhale': return selectedPattern.exhale;
      case 'holdAfterExhale': return selectedPattern.holdAfterExhale || 0;
      default: return 0;
    }
  };

  const getPhaseText = (): string => {
    switch (currentPhase) {
      case 'prepare': return 'Prepare to begin';
      case 'inhale': return 'Breathe In';
      case 'hold': return 'Hold';
      case 'exhale': return 'Breathe Out';
      case 'holdAfterExhale': return 'Hold';
      default: return '';
    }
  };

  const startBreathing = async (pattern: BreathingPattern) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedPattern(pattern);
    setIsActive(true);
    setCurrentPhase('prepare');
    setTimeInPhase(0);
    setCycleCount(0);
  };

  const pauseBreathing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsActive(false);
  };

  const resumeBreathing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsActive(true);
  };

  const stopBreathing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsActive(false);
    setSelectedPattern(null);
    setCurrentPhase('prepare');
    setTimeInPhase(0);
    setCycleCount(0);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset breathing state on refresh
    setIsActive(false);
    setSelectedPattern(null);
    setCurrentPhase('prepare');
    setTimeInPhase(0);
    setCycleCount(0);
    setRefreshing(false);
  };

  if (!fontsLoaded) return null;

  // Active breathing session
  if (selectedPattern && isActive) {
    const progress = timeInPhase / getCurrentPhaseDuration();
    
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <MotiView
          from={reduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', ...motion.gentle }}
          style={{ flex: 1 }}
        >
          <View style={[styles.breathingContainer, { paddingBottom: tabBarHeight + spacing.lg }]}>
            
            {/* Breathing Circle */}
            <View style={styles.breathingCircleContainer}>
              <MotiView
                from={{ scale: 0.6 }}
                animate={{ 
                  scale: currentPhase === 'inhale' || currentPhase === 'hold' ? 1.2 : 0.6 
                }}
                transition={{
                  type: 'timing',
                  duration: getCurrentPhaseDuration() * 1000,
                }}
                style={[
                  styles.breathingCircle,
                  { backgroundColor: colors.accentSoft, borderColor: colors.accent }
                ]}
              />
              
              <View style={styles.breathingContent}>
                <Wind size={64} weight="duotone" color={colors.accent} />
                <Text 
                  style={[typography.displayMd, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}
                  accessibilityRole="text"
                  accessibilityLabel={`${getPhaseText()}, ${getCurrentPhaseDuration() - timeInPhase} seconds remaining`}
                >
                  {getPhaseText()}
                </Text>
                <Text style={[typography.bodyLg, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
                  {getCurrentPhaseDuration() - timeInPhase}
                </Text>
              </View>
            </View>

            {/* Pattern Info */}
            <Text style={[typography.bodyMd, { color: colors.textPrimary, textAlign: 'center', fontWeight: '600' }]}>
              {selectedPattern.name}
            </Text>
            <Text 
              style={[typography.bodySm, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }]}
              accessibilityRole="text"
              accessibilityLabel={`Cycle ${cycleCount} completed`}
            >
              Cycle {cycleCount}
            </Text>

            {/* Controls */}
            <View style={styles.breathingControls}>
              <Pressable
                onPress={isActive ? pauseBreathing : resumeBreathing}
                style={({ pressed }) => [
                  styles.controlButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }
                ]}
                accessibilityRole="button"
                accessibilityLabel={isActive ? 'Pause breathing' : 'Resume breathing'}
                hitSlop={8}
              >
                {isActive ? (
                  <Pause size={24} weight="fill" color="#FFFFFF" />
                ) : (
                  <Play size={24} weight="fill" color="#FFFFFF" />
                )}
              </Pressable>
              
              <Pressable
                onPress={stopBreathing}
                style={({ pressed }) => [
                  styles.controlButton,
                  { backgroundColor: colors.error, opacity: pressed ? 0.8 : 1 }
                ]}
                accessibilityRole="button"
                accessibilityLabel="Stop breathing exercise"
                hitSlop={8}
              >
                <Square size={24} weight="fill" color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </MotiView>
      </SafeAreaView>
    );
  }

  // Pattern selection screen
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <MotiView
        from={reduceMotion ? undefined : { opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', ...motion.gentle }}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.lg }}>
            
            {/* Header */}
            <Text style={[typography.displayLg, { color: colors.textPrimary, marginBottom: spacing.lg }]}>
              Breathing Exercises
            </Text>
            
            <Text style={[typography.bodyMd, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
              Choose a breathing pattern to begin your practice
            </Text>

            {/* Patterns */}
            <View style={styles.patternsContainer}>
              {BREATHING_PATTERNS.map((pattern, index) => (
                <MotiView
                  key={pattern.id}
                  from={reduceMotion ? undefined : { opacity: 0, translateY: 20 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'spring', ...motion.gentle, delay: index * 100 }}
                >
                  <Card>
                    <View style={styles.patternContent}>
                      <View style={styles.patternHeader}>
                        <View style={[styles.patternIcon, { backgroundColor: colors.accentSoft }]}>
                          <Wind size={24} weight="duotone" color={colors.accent} />
                        </View>
                        <View style={styles.patternInfo}>
                          <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600' }]}>
                            {pattern.name}
                          </Text>
                          <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}>
                            {pattern.description}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.patternTiming}>
                        <Text style={[typography.bodySm, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
                          Pattern: {pattern.inhale}-{pattern.hold}-{pattern.exhale}
                          {pattern.holdAfterExhale && `-${pattern.holdAfterExhale}`}
                        </Text>
                        <Button
                          variant="primary"
                          label="Start Exercise"
                          onPress={() => startBreathing(pattern)}
                        />
                      </View>
                    </View>
                  </Card>
                </MotiView>
              ))}
            </View>
          </View>
        </ScrollView>
      </MotiView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  patternsContainer: { gap: spacing.md },
  patternContent: { gap: spacing.md },
  patternHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  patternIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  patternInfo: { flex: 1 },
  patternTiming: {},
  
  // Active breathing styles
  breathingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  breathingCircleContainer: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  breathingCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
  },
  breathingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  breathingControls: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});