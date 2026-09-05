'use client';

import { Lock, Timer, Unlock } from 'lucide-react';
import { useVault } from '@/components/system/VaultProvider';
import { Button } from '@/components/primitives';

/**
 * The strip that says, unambiguously, that the vault is open and for how much
 * longer (§74). An unlocked vault should never be a state you are in without
 * noticing.
 */
export function VaultStatusBar() {
  const { unlocked, locksIn, lock, status } = useVault();

  if (!unlocked) return null;

  const minutes = Math.floor((locksIn ?? 0) / 60);
  const seconds = (locksIn ?? 0) % 60;
  const urgent = (locksIn ?? 0) <= 60;

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-3 rounded border px-3 py-[7px]"
      style={{
        borderColor: 'color-mix(in srgb, var(--security) 35%, transparent)',
        background: 'color-mix(in srgb, var(--security) 8%, transparent)',
      }}
    >
      <Unlock size={13} className="shrink-0 text-[var(--security)]" />
      <span className="text-[12.5px] text-[var(--text-muted)]">Vault is unlocked in this tab.</span>

      <span
        className="mono flex items-center gap-[5px] text-[11.5px]"
        style={{ color: urgent ? 'var(--warning)' : 'var(--text-faint)' }}
      >
        <Timer size={11} />
        locks in {minutes}:{String(seconds).padStart(2, '0')}
      </span>

      <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">
        clipboard clears after {status?.clipboardSeconds ?? 20}s
      </span>

      <Button variant="ghost" onClick={lock}>
        <Lock size={12} /> Lock now
      </Button>
    </div>
  );
}
