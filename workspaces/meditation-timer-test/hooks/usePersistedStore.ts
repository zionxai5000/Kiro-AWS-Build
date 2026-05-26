import { useEffect, useState } from 'react';

interface PersistedStore {
  isLoading: boolean;
}

export function usePersistedStore<T extends PersistedStore>(store: T) {
  const [isRehydrated, setIsRehydrated] = useState(false);

  useEffect(() => {
    if (!store.isLoading && !isRehydrated) {
      setIsRehydrated(true);
    }
  }, [store.isLoading, isRehydrated]);

  return {
    ...store,
    isRehydrated,
  };
}