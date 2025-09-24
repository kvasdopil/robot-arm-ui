'use client';

import { useCallback, useEffect, useState } from 'react';

export function usePersistedState<T>(key: string, defaultValue: T): [T, (next: T) => void] {
    const [value, setValue] = useState<T>(() => {
        if (typeof window === 'undefined') return defaultValue;
        try {
            const raw = window.localStorage.getItem(key);
            return raw != null ? (JSON.parse(raw) as T) : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore write errors
        }
    }, [key, value]);

    const update = useCallback((next: T) => {
        setValue(next);
    }, []);

    return [value, update];
}
