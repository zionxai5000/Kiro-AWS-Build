/**
 * Single data-access layer (the "data layer" Hook 12 enforces).
 *
 * Generic shape: a zustand store with persist() + AsyncStorage. Every app
 * extends this with its own entities. Two slices are always present:
 *   - hasCompletedOnboarding  (flag for first-launch routing)
 *   - lastUsedAt              (for analytics + smart welcome-back)
 *
 * Domain-specific entities (habits, todos, recipes...) get added in their
 * own slice files and re-exported here so screens import from one place.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppCoreState {
  hasCompletedOnboarding: boolean;
  lastUsedAt: string | null;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  touchLastUsed: () => void;
}

export const useAppCore = create<AppCoreState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      lastUsedAt: null,
      completeOnboarding: () => set({ hasCompletedOnboarding: true, lastUsedAt: new Date().toISOString() }),
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
      touchLastUsed: () => set({ lastUsedAt: new Date().toISOString() }),
    }),
    {
      name: 'zionx-app-core-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

// Re-export the persist + storage helpers so domain stores stay consistent.
export { persist, createJSONStorage, AsyncStorage };
