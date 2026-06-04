const s = `
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
export const useHabits = create(persist(
  (set) => ({ habits: [], add: (h) => set((s) => ({ habits: [...s.habits, h] })) }),
  { name: 'habits-storage', storage: createJSONStorage(() => AsyncStorage) },
));
`;
console.log('persist call:', /persist\s*\(/.test(s));
console.log('zustand/middleware:', /from ['"]zustand\/middleware['"]/.test(s));
console.log('AsyncStorage import:', /from ['"]@react-native-async-storage\/async-storage['"]/.test(s));
console.log('createJSONStorage(... AsyncStorage):', /createJSONStorage\s*\([^)]*AsyncStorage/.test(s));
console.log('persist key named:', /name\s*:\s*['"][\w-]+['"]/.test(s));
