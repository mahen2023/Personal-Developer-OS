'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'devos.theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: 'dark' | 'light';
  setPreference: (value: ThemePreference) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inlined in <head> so the correct theme is painted before first paint. Without
 * it a dark-mode user gets a white flash on every navigation — the single most
 * expensive-looking bug a "premium dark-first" app can ship.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var p=localStorage.getItem('${STORAGE_KEY}')||'system';
var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=d?'dark':'light';
}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<'dark' | 'light'>('dark');

  const apply = useCallback((value: ThemePreference) => {
    const dark =
      value === 'dark' ||
      (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    setResolved(dark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? 'system';
    setPreferenceState(stored);
    apply(stored);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? 'system') === 'system') apply('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [apply]);

  const setPreference = useCallback(
    (value: ThemePreference) => {
      localStorage.setItem(STORAGE_KEY, value);
      setPreferenceState(value);
      apply(value);
    },
    [apply],
  );

  const cycle = useCallback(() => {
    const order: ThemePreference[] = ['dark', 'light', 'system'];
    setPreference(order[(order.indexOf(preference) + 1) % order.length]);
  }, [preference, setPreference]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, cycle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
