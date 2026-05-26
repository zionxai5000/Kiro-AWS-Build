import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, Pressable, AccessibilityInfo, AppState } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MotiView } from 'moti';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Play, Pause, Square, TimerIcon as Timer } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { motion } from '../../theme/motion';
import { useMeditationStore } from '../../store/meditationStore';
import { useAppState } from '../../hooks/useAppState';

const TIMER_DURATIONS = [5, 10, 15, 20, 30, 45, 60];

export default function TimerScreen() {
  const colors = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [refreshing, setRefreshing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  
  // Timer state
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState<{ visible: boolean; message: string; type?: 'success' | 'error' }>({
    visible: false,
    message: '',
  });

  const { addSession, getStats } = useMeditationStore();
  const { isActive } = useAppState();
  
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Pause timer when app goes to background
  useEffect(() => {
    if (!isActive && isRunning) {
      setIsRunning(false);
    }
  }, [isActive, isRunning]);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsComplete(true);
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const handleSessionComplete = async () => {
    try {
      addSession({ duration: selectedDuration });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      const stats = getStats();
      const isFirstSession = stats.totalSessions === 1;
      const message = isFirstSession 
        ? 'Session complete! Journey started!' 
        : `Session complete! ${stats.currentStreak} day streak!`;
        
      setToast({ visible: true, message, type: 'success' });
    } catch (error) {
      setToast({ visible: true, message: 'Failed to save session', type: 'error' });
    }
  };

  const startTimer = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeRemaining(selectedDuration * 60);
    setIsRunning(true);
    setIsComplete(false);
  };

  const pauseTimer = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRunning(false);
  };

  const resumeTimer = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRunning(true);
  };

  const stopTimer = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRunning(false);
    setTimeRemaining(0);
    setIsComplete(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset timer state on refresh
    setIsRunning(false);
    setTimeRemaining(0);
    setIsComplete(false);
    setRefreshing(false);
  };

  if (!fontsLoaded) return null;

  const isTimerActive = timeRemaining > 0;
  const stats = getStats();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Toast 
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
      />
      
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
              Meditation Timer
            </Text>

            {/* Timer Display */}
            <Card level={2}>
              <View style={styles.timerContainer}>
                <View 
                  style={[styles.timerCircle, { borderColor: colors.accent }]}
                  accessible={true}
                  accessibilityRole="text"
                  accessibilityLabel={`Timer showing ${isTimerActive ? formatTime(timeRemaining) + ' remaining' : selectedDuration + ' minutes selected'}`}
                >
                  <Timer size={48} weight="duotone" color={colors.accent} />
                  <Text style={[typography.displayXl, { color: colors.textPrimary, marginTop: spacing.sm }]}>
                    {isTimerActive ? formatTime(timeRemaining) : `${selectedDuration}:00`}
                  </Text>
                </View>
                
                {/* Timer Controls */}
                <View style={styles.timerControls}>
                  {!isTimerActive ? (
                    <Button
                      variant="primary"
                      label="Start Session"
                      onPress={startTimer}
                    />
                  ) : (
                    <View style={styles.activeControls}>
                      <Pressable
                        onPress={isRunning ? pauseTimer : resumeTimer}
                        style={({ pressed }) => [
                          styles.controlButton,
                          { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={isRunning ? 'Pause timer' : 'Resume timer'}
                        hitSlop={8}
                      >
                        {isRunning ? (
                          <Pause size={24} weight="fill" color="#FFFFFF" />
                        ) : (
                          <Play size={24} weight="fill" color="#FFFFFF" />
                        )}
                      </Pressable>
                      
                      <Pressable
                        onPress={stopTimer}
                        style={({ pressed }) => [
                          styles.controlButton,
                          { backgroundColor: colors.error, opacity: pressed ? 0.8 : 1 }
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Stop timer"
                        hitSlop={8}
                      >
                        <Square size={24} weight="fill" color="#FFFFFF" />
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            </Card>

            {/* Duration Selection */}
            {!isTimerActive && (
              <MotiView
                from={reduceMotion ? undefined : { opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'spring', ...motion.gentle, delay: 200 }}
              >
                <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xl, marginBottom: spacing.md }]}>
                  Select Duration
                </Text>
                <View style={styles.durationGrid}>
                  {TIMER_DURATIONS.map((duration) => (
                    <Pressable
                      key={duration}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDuration(duration);
                      }}
                      style={({ pressed }) => [
                        styles.durationButton,
                        {
                          backgroundColor: selectedDuration === duration ? colors.primary : colors.surface,
                          borderColor: selectedDuration === duration ? colors.primary : colors.border,
                          opacity: pressed ? 0.8 : 1,
                        }
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${duration} minutes`}
                      accessibilityState={{ selected: selectedDuration === duration }}
                    >
                      <Text style={[
                        typography.bodyMd,
                        {
                          color: selectedDuration === duration ? '#FFFFFF' : colors.textPrimary,
                          fontWeight: '600',
                        }
                      ]}>
                        {duration}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </MotiView>
            )}

            {/* Quick Stats */}
            <MotiView
              from={reduceMotion ? undefined : { opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', ...motion.gentle, delay: 300 }}
            >
              <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xl, marginBottom: spacing.md }]}>
                Your Progress
              </Text>
              <View style={styles.statsGrid}>
                <Card>
                  <View 
                    style={styles.statItem}
                    accessible={true}
                    accessibilityRole="text"
                    accessibilityLabel={`Current streak: ${stats.currentStreak} days`}
                  >
                    <Text style={[typography.displayMd, { color: colors.primary }]}>
                      {stats.currentStreak}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase' }]}>
                      Day Streak
                    </Text>
                  </View>
                </Card>
                <Card>
                  <View 
                    style={styles.statItem}
                    accessible={true}
                    accessibilityRole="text"
                    accessibilityLabel={`Total sessions: ${stats.totalSessions}`}
                  >
                    <Text style={[typography.displayMd, { color: colors.accent }]}>
                      {stats.totalSessions}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase' }]}>
                      Sessions
                    </Text>
                  </View>
                </Card>
              </View>
            </MotiView>
            
          </View>
        </ScrollView>
      </MotiView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  timerContainer: { alignItems: 'center' },
  timerCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerControls: { marginTop: spacing.xl, width: '100%' },
  activeControls: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: spacing.lg,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  durationButton: {
    width: '31%',
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
  },
});