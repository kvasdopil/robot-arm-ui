'use client';

import { useCallback, useEffect, useState } from 'react';

export function usePersistedState<T>(key: string, defaultValue: T): [T, (next: T) => void] {
  // Initialize with defaultValue on both server and first client render to avoid hydration mismatches
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  // After mount, read from localStorage and update state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore read errors
    } finally {
      setHydrated(true);
    }
  }, [key]);

  // Only write after we've attempted hydration to avoid overwriting existing values
  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write errors
    }
  }, [key, value, hydrated]);

  const update = useCallback((next: T) => {
    setValue(next);
  }, []);

  return [value, update];
}
