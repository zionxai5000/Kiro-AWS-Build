/**
 * Onboarding route — wraps `OnboardingFlow`. Routing back to /(tabs) after
 * the user finishes happens in `app/_layout.tsx` via the segments effect.
 */

import React from 'react';
import { useRouter } from 'expo-router';
import OnboardingFlow from '../src/onboarding/OnboardingFlow';

export default function OnboardingRoute() {
  const router = useRouter();
  return (
    <OnboardingFlow
      onComplete={() => {
        // Layout effect will pick up the persist flip and route to (tabs),
        // but redirect immediately for snappier UX.
        router.replace('/(tabs)');
      }}
    />
  );
}
