/**
 * Home — hero card pattern. The agent customizes this for each app:
 *   habit tracker → list of habit cards
 *   todo → sectioned tasks
 *   recipe → image grid
 *
 * The starter ships a friendly empty state so freshly-scaffolded apps look
 * intentional, not blank, while the agent is still emitting code.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { Sparkles } from 'lucide-react-native';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { useTheme } from '../../src/theme';

export default function Home() {
  const { colors, spacing, typography } = useTheme();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MotiView
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 180 }}
          style={{ marginBottom: spacing.xl }}
        >
          <Text style={[typography.largeTitle, { color: colors.textPrimary }]}>Welcome</Text>
          <Text
            style={[
              typography.body,
              { color: colors.textSecondary, marginTop: spacing.xs },
            ]}
          >
            Your starter is wired with persistence, onboarding, and the design system.
          </Text>
        </MotiView>

        <Card index={0} highlighted style={{ marginBottom: spacing.base }}>
          <View style={styles.heroRow}>
            <View
              style={[
                styles.heroIconWrap,
                { backgroundColor: colors.accentSoft },
              ]}
            >
              <Sparkles size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyEmph, { color: colors.textPrimary }]}>
                You're all set up
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textSecondary, marginTop: spacing.xs },
                ]}
              >
                Add a feature card here — habit row, recipe tile, mood entry.
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ minHeight: 320, marginTop: spacing.lg }}>
          <EmptyState
            icon="✨"
            iconLabel="Sparkles"
            headline="Nothing to show yet"
            subtitle="The agent will populate this screen with cards once it knows what kind of app you're building."
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
