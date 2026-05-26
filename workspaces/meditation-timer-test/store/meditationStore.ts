import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MeditationSession {
  id: string;
  duration: number; // minutes
  breathingPattern?: string;
  completedAt: string; // ISO string
  dayKey: string; // YYYY-MM-DD
}

export interface MeditationStats {
  totalSessions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
}

export interface MeditationState {
  sessions: MeditationSession[];
  isLoading: boolean;

  // Actions
  addSession: (session: Omit<MeditationSession, 'id' | 'completedAt' | 'dayKey'>) => void;
  getStats: () => MeditationStats;
  getSessionsForDay: (dayKey: string) => MeditationSession[];
  loadData: () => Promise<void>;
}

function getMeditationDayKey(date: Date): string {
  // Use UTC date for stable day boundaries across timezones
  const utc = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return utc.toISOString().split('T')[0]; // YYYY-MM-DD
}

function calculateStreak(sessions: MeditationSession[]): { current: number; longest: number } {
  const dayKeys = [...new Set(sessions.map(s => s.dayKey))].sort();
  
  if (dayKeys.length === 0) return { current: 0, longest: 0 };

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  const today = getMeditationDayKey(new Date());
  const yesterday = getMeditationDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  // Calculate longest streak
  for (let i = 0; i < dayKeys.length; i++) {
    if (i === 0 || dayKeys[i] === dayKeys[i - 1]) {
      tempStreak = 1;
    } else {
      const prevDate = new Date(dayKeys[i - 1]);
      const currDate = new Date(dayKeys[i]);
      const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
      
      if (dayDiff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  // Calculate current streak
  const latestDay = dayKeys[dayKeys.length - 1];
  if (latestDay === today || latestDay === yesterday) {
    currentStreak = 1;
    
    for (let i = dayKeys.length - 2; i >= 0; i--) {
      const prevDate = new Date(dayKeys[i]);
      const nextDate = new Date(dayKeys[i + 1]);
      const dayDiff = Math.floor((nextDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
      
      if (dayDiff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { current: currentStreak, longest: longestStreak };
}

export const useMeditationStore = create<MeditationState>()(
  persist(
    (set, get) => ({
      sessions: [],
      isLoading: true,

      addSession: (session) => {
        const now = new Date();
        const newSession: MeditationSession = {
          id: Date.now().toString(),
          ...session,
          completedAt: now.toISOString(),
          dayKey: getMeditationDayKey(now),
        };

        set((state) => ({
          sessions: [...state.sessions, newSession],
        }));
      },

      getStats: () => {
        const { sessions } = get();
        const totalSessions = sessions.length;
        const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
        const { current, longest } = calculateStreak(sessions);

        return {
          totalSessions,
          totalMinutes,
          currentStreak: current,
          longestStreak: longest,
        };
      },

      getSessionsForDay: (dayKey) => {
        const { sessions } = get();
        return sessions.filter(s => s.dayKey === dayKey);
      },

      loadData: async () => {
        // Data is automatically rehydrated from AsyncStorage
        // by persist middleware. This just signals UI ready.
        set({ isLoading: false });
      },
    }),
    {
      name: 'meditation-storage-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);