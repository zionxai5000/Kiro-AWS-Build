import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    AsyncStorage.getItem('hasOnboarded').then((value) => {
      setHasOnboarded(value === 'true');
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (hasOnboarded === null) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!hasOnboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (hasOnboarded && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [hasOnboarded, segments]);

  if (!fontsLoaded || hasOnboarded === null) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
        </Stack>
        <StatusBar style="auto" />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}