/**
 * Root layout — providers, theme, gradient background, onboarding gate.
 *
 * Routes to /onboarding when `hasCompletedOnboarding === false`.
 * Otherwise routes to /(tabs).
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAppCore } from '../src/data';
import { useTheme } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemedShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedShell() {
  const { colors, gradients } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const hasCompletedOnboarding = useAppCore((s) => s.hasCompletedOnboarding);

  useEffect(() => {
    const top = segments[0] ?? '';
    const inOnboarding = top === 'onboarding';
    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    } else if (hasCompletedOnboarding && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [hasCompletedOnboarding, segments, router]);

  return (
    <View style={[styles.shell, { backgroundColor: colors.bgBase }]}>
      <LinearGradient
        colors={gradients.background as readonly [string, string, ...string[]]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1 },
});
