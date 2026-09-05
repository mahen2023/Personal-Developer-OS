'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { clockTime } from '@/lib/format';
import type { Readiness } from '@/lib/types';
import { Button, StatusIndicator, type Signal } from '@/components/primitives';

const SIGNAL: Record<string, Signal> = {
  ok: 'success',
  ready: 'success',
  enabled: 'success',
  local: 'info',
  disabled: 'neutral',
  'not-checked': 'neutral',
  degraded: 'warning',
  down: 'danger',
};

/**
 * The screen you open when a self-hosted box is misbehaving (§58). It only ever
 * reports what the API actually checked — an unimplemented subsystem shows as
 * "not-checked", never as a green tick.
 */
export default function DiagnosticsPage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    const result = await api<Readiness>('/ready').catch(() => ({
      status: 'down',
      version: '—',
      checks: { api: 'down' },
    }));
    setReadiness(result);
    setCheckedAt(new Date());
    setBusy(false);
  }

  useEffect(() => {
    void check();
  }, []);

  return (
    <div className="mx-auto max-w-[620px] px-6 pb-16 pt-6">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Diagnostics</h1>
          <p className="mt-[2px] text-[12.5px] text-[var(--text-muted)]">
            Live state of every subsystem this instance depends on.
          </p>
        </div>
        <Button onClick={() => void check()} disabled={busy}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} />
          Re-check
        </Button>
      </header>

      <section
        aria-label="Subsystems"
        className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]"
      >
        <div className="label flex items-center justify-between border-b border-line px-4 py-[9px]">
          <span>Subsystems</span>
          {checkedAt && <span className="mono normal-case">checked {clockTime(checkedAt)}</span>}
        </div>

        <Row label="Overall" value={readiness?.status ?? 'checking'} />
        <Row label="Version" value={readiness?.version ?? '—'} plain />
        {Object.entries(readiness?.checks ?? {}).map(([name, state]) => (
          <Row key={name} label={name} value={state} />
        ))}
      </section>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Each row is asked at the moment you load this page, never cached. Redis being down shows as
        degraded rather than down — the application still serves, the scheduled work simply stops.{' '}
        <strong className="font-medium">Embeddings</strong> says which kind of matching is loaded:{' '}
        <span className="mono">lexical</span> matches words, <span className="mono">semantic</span>{' '}
        matches meaning, and they are not the same product.
      </p>
    </div>
  );
}

function Row({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-[9px] last:border-b-0">
      <span className="w-[120px] shrink-0 text-[12.5px] capitalize">{label}</span>
      {plain ? (
        <span className="mono text-[12px] text-[var(--text-muted)]">{value}</span>
      ) : (
        <StatusIndicator signal={SIGNAL[value] ?? 'neutral'} label={value} />
      )}
    </div>
  );
}
