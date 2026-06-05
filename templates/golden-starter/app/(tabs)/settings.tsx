/**
 * Settings — re-open onboarding entry, theme info, basic chrome.
 *
 * The hook 15 onboarding rule requires onboarding to be re-openable; this
 * is where users get back to it. Generated apps extend this screen.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Info, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '../../src/components/Card';
import { useAppCore } from '../../src/data';
import { useTheme } from '../../src/theme';

export default function Settings() {
  const { colors, spacing, typography, isDark } = useTheme();
  const router = useRouter();
  const resetOnboarding = useAppCore((s) => s.resetOnboarding);

  const handleReopenOnboarding = () => {
    Haptics.selectionAsync().catch(() => {});
    resetOnboarding();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: 96,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[
            typography.largeTitle,
            { color: colors.textPrimary, marginBottom: spacing.xl },
          ]}
        >
          Settings
        </Text>

        <Text
          style={[
            typography.caption,
            {
              color: colors.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: spacing.sm,
            },
          ]}
        >
          About
        </Text>

        <Card index={0} style={{ marginBottom: spacing.md }}>
          <Pressable onPress={handleReopenOnboarding} style={styles.row}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.accentSoft },
              ]}
            >
              <RefreshCw size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[typography.bodyEmph, { color: colors.textPrimary }]}
              >
                Re-open onboarding
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
                ]}
              >
                Walk through the welcome flow again
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>
        </Card>

        <Card index={1}>
          <View style={styles.row}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.accentSoft },
              ]}
            >
              <Info size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[typography.bodyEmph, { color: colors.textPrimary }]}
              >
                Theme
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textSecondary, marginTop: 2, fontSize: 13 },
                ]}
              >
                Following system: {isDark ? 'dark' : 'light'}
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
