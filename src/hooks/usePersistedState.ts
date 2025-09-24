'use client';

import { useCallback, useEffect, useState } from 'react';

export function usePersistedState<T>(key: string, defaultValue: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // ignore read errors
    } finally {
      setInitialized(true);
    }
  }, [key]);

  useEffect(() => {
    if (!initialized) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore write errors
    }
  }, [key, value, initialized]);

  const update = useCallback((next: T) => {
    setValue(next);
  }, []);

  return [value, update];
}
