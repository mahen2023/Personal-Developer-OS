'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { DashboardSummary, Readiness, SessionUser } from '@/lib/types';

interface WorkspaceValue {
  user: SessionUser | null;
  summary: DashboardSummary | null;
  readiness: Readiness | null;
  loading: boolean;

  railCollapsed: boolean;
  toggleRail: () => void;

  contextOpen: boolean;
  toggleContext: () => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Layout preferences are per-device, so they live in localStorage, not the API. */
function usePersistedFlag(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored === '1');
  }, [key]);

  const toggle = useCallback(() => {
    setValue((current) => {
      localStorage.setItem(key, current ? '0' : '1');
      return !current;
    });
  }, [key]);

  return [value, toggle];
}

/**
 * Holds everything the chrome needs: who is signed in, the counts the rail and
 * dashboard display, backend health for the status bar, and the open/closed
 * state of the panels. One fetch on mount serves all of them.
 */
export function WorkspaceProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const [railCollapsed, toggleRail] = usePersistedFlag('devos.rail.collapsed', false);
  const [contextOpen, toggleContext] = usePersistedFlag('devos.context.open', true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const refresh = useCallback(async () => {
    // Health is public and must not fail the whole load if the API is degraded.
    const [me, dashboard, ready] = await Promise.allSettled([
      api<SessionUser>('/auth/me'),
      api<DashboardSummary>('/dashboard/summary'),
      api<Readiness>('/ready'),
    ]);
    if (me.status === 'fulfilled') setUser(me.value);
    if (dashboard.status === 'fulfilled') setSummary(dashboard.value);
    setReadiness(
      ready.status === 'fulfilled'
        ? ready.value
        : { status: 'down', version: '—', checks: { database: 'down' } },
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      user,
      summary,
      readiness,
      loading,
      railCollapsed,
      toggleRail,
      contextOpen,
      toggleContext,
      paletteOpen,
      setPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
      refresh,
    }),
    [
      user,
      summary,
      readiness,
      loading,
      railCollapsed,
      toggleRail,
      contextOpen,
      toggleContext,
      paletteOpen,
      shortcutsOpen,
      refresh,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
}
