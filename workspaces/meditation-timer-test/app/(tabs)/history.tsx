import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, AccessibilityInfo } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { MotiView } from 'moti';
import { FlashList } from '@shopify/flash-list';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Flame, ChartLine, Clock, Calendar } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTheme } from '../../theme/useTheme';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { motion } from '../../theme/motion';
import { useMeditationStore, type MeditationSession } from '../../store/meditationStore';

export default function HistoryScreen() {
  const colors = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const { sessions, getStats, loadData } = useMeditationStore();
  
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    loadData().finally(() => setIsLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadData();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
    });
  };

  if (!fontsLoaded) return null;

  // LOADING STATE
  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.lg, gap: spacing.md }}>
          <Skeleton width="60%" height={40} />
          <View style={styles.statsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} width="48%" height={80} />
            ))}
          </View>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={88} borderRadius={16} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  const stats = getStats();
  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  // EMPTY STATE
  if (sessions.length === 0) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <MotiView 
          from={reduceMotion ? undefined : { opacity: 0, translateY: 20 }} 
          animate={{ opacity: 1, translateY: 0 }} 
          transition={{ type: 'spring', ...motion.gentle }}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <EmptyState
            icon={ChartLine}
            headline="No sessions yet"
            helper="Complete your first meditation to see your progress here."
            ctaLabel="Start Meditating"
            onCtaPress={() => {
              // Navigation would be handled by parent tab navigator
            }}
          />
        </MotiView>
      </SafeAreaView>
    );
  }

  // HAPPY STATE
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
              Your Journey
            </Text>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <Card>
                <View 
                  style={styles.statItem}
                  accessible={true}
                  accessibilityRole="text"
                  accessibilityLabel={`Current streak: ${stats.currentStreak} days`}
                >
                  <Flame size={24} weight="duotone" color={colors.primary} />
                  <Text style={[typography.displayMd, { color: colors.primary, marginTop: spacing.xs }]}>
                    {stats.currentStreak}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 }]}>
                    Current Streak
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
                  <Calendar size={24} weight="duotone" color={colors.accent} />
                  <Text style={[typography.displayMd, { color: colors.accent, marginTop: spacing.xs }]}>
                    {stats.totalSessions}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 }]}>
                    Total Sessions
                  </Text>
                </View>
              </Card>
              
              <Card>
                <View 
                  style={styles.statItem}
                  accessible={true}
                  accessibilityRole="text"
                  accessibilityLabel={`Total minutes: ${stats.totalMinutes}`}
                >
                  <Clock size={24} weight="duotone" color={colors.success} />
                  <Text style={[typography.displayMd, { color: colors.success, marginTop: spacing.xs }]}>
                    {stats.totalMinutes}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 }]}>
                    Total Minutes
                  </Text>
                </View>
              </Card>
              
              <Card>
                <View 
                  style={styles.statItem}
                  accessible={true}
                  accessibilityRole="text"
                  accessibilityLabel={`Longest streak: ${stats.longestStreak} days`}
                >
                  <ChartLine size={24} weight="duotone" color={colors.warning} />
                  <Text style={[typography.displayMd, { color: colors.warning, marginTop: spacing.xs }]}>
                    {stats.longestStreak}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 }]}>
                    Longest Streak
                  </Text>
                </View>
              </Card>
            </View>

            {/* Sessions List */}
            <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xl, marginBottom: spacing.md }]}>
              Recent Sessions
            </Text>
            
            <View style={{ height: 400 }}>
              <FlashList
                data={sortedSessions}
                estimatedItemSize={88}
                ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }: { item: MeditationSession }) => (
                  <Card>
                    <View style={styles.sessionItem}>
                      <View style={styles.sessionInfo}>
                        <Text style={[typography.bodyMd, { color: colors.textPrimary, fontWeight: '600' }]}>
                          {item.duration} minute meditation
                        </Text>
                        {item.breathingPattern && (
                          <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 2 }]}>
                            {item.breathingPattern}
                          </Text>
                        )}
                        <Text style={[typography.bodySm, { color: colors.textSecondary, marginTop: 4 }]}>
                          {formatDate(item.completedAt)} at {formatTime(item.completedAt)}
                        </Text>
                      </View>
                      <View style={[styles.sessionIcon, { backgroundColor: colors.accentSoft }]}>
                        <Clock size={20} weight="duotone" color={colors.accent} />
                      </View>
                    </View>
                  </Card>
                )}
              />
            </View>
          </View>
        </ScrollView>
      </MotiView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    minWidth: '48%',
    alignItems: 'center',
    padding: spacing.sm,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});