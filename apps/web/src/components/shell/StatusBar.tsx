'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { findNavItem } from '@/lib/navigation';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { KeyHint, SIGNAL_COLOR, StatusIndicator, type Signal } from '@/components/primitives';

const CHECK_SIGNAL: Record<string, Signal> = {
  ok: 'success',
  ready: 'success',
  enabled: 'success',
  local: 'info',
  disabled: 'neutral',
  'not-checked': 'neutral',
  down: 'danger',
  degraded: 'warning',
};

/**
 * The bottom rule (§6). It carries persistent, glanceable machine state —
 * subsystem health, where you are, what version is running — so none of it has
 * to interrupt as a toast.
 */
export function StatusBar() {
  const pathname = usePathname();
  const { readiness, loading, setShortcutsOpen } = useWorkspace();
  const clock = useClock();
  const location = findNavItem(pathname);
  const checks = readiness?.checks ?? {};

  return (
    <footer
      className="mono flex shrink-0 items-center gap-4 border-t border-line bg-[var(--surface-sunken)] px-3 text-[11px] text-[var(--text-faint)]"
      style={{ height: 'var(--statusbar-h)' }}
    >
      <StatusIndicator
        signal={loading ? 'neutral' : (CHECK_SIGNAL[readiness?.status ?? 'down'] ?? 'warning')}
        label={loading ? 'connecting' : (readiness?.status ?? 'offline')}
        pulse={!loading && readiness?.status === 'ready'}
      />

      <span className="hidden items-center gap-3 md:flex">
        {Object.entries(checks).map(([name, state]) => (
          <span key={name} className="flex items-center gap-[5px]">
            <span
              className="h-[5px] w-[5px] rounded-full"
              style={{ background: SIGNAL_COLOR[CHECK_SIGNAL[state] ?? 'neutral'] }}
            />
            {name}
          </span>
        ))}
      </span>

      <span className="ml-auto hidden items-center gap-1 lg:flex">
        {location && <span>{location.section.label.toLowerCase()}</span>}
      </span>

      <button
        onClick={() => setShortcutsOpen(true)}
        className="flex items-center gap-[6px] transition-colors duration-[var(--fast)] hover:text-[var(--text)]"
      >
        shortcuts <KeyHint keys={['?']} />
      </button>

      <span>v{readiness?.version ?? '0.1.0'}</span>
      <span className="num tabular-nums">{clock}</span>
    </footer>
  );
}

/** Ticks once a minute — a per-second clock would re-render the shell 60x more. */
function useClock(): string {
  const [time, setTime] = useState('');

  useEffect(() => {
    const render = () =>
      setTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      );
    render();
    const timer = setInterval(render, 30_000);
    return () => clearInterval(timer);
  }, []);

  return time;
}
