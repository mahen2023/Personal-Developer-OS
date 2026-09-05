'use client';

import { useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import type { CommandRecord } from '@/lib/types';
import { Button } from '@/components/primitives';

/**
 * Copy, with a confirmation on anything destructive (§26).
 *
 * The dialog is deliberately modal and names the command: the failure mode
 * this guards against is muscle memory — hitting copy on the wrong row and
 * pasting `rm -rf` into a production shell a second later.
 */
export function DangerCopyButton({
  command,
  onCopied,
  label,
}: {
  command: CommandRecord;
  onCopied?: () => void;
  label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const dangerous = command.dangerLevel === 'DESTRUCTIVE' || command.dangerLevel === 'HIGH';

  async function copy() {
    try {
      await navigator.clipboard.writeText(command.command);
    } catch {
      window.prompt('Copy this manually:', command.command);
    }
    setCopied(true);
    setConfirming(false);
    window.setTimeout(() => setCopied(false), 1600);
    await api(`/commands/${command.id}/used`, { method: 'POST' }).catch(() => undefined);
    onCopied?.();
  }

  return (
    <>
      <button
        onClick={(event) => {
          // The row is a link; copying must not navigate.
          event.preventDefault();
          event.stopPropagation();
          if (dangerous) setConfirming(true);
          else void copy();
        }}
        title={dangerous ? 'Confirm before copying' : 'Copy command'}
        className={cx(
          'inline-flex h-[22px] items-center gap-[5px] rounded border px-[7px] text-[11px] transition-colors duration-[var(--fast)]',
          copied
            ? 'border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]'
            : dangerous
              ? 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:bg-[var(--danger-dim)]'
              : 'border-line text-[var(--text-muted)] hover:border-[var(--line-strong)]',
        )}
      >
        {copied ? (
          <Check size={11} />
        ) : dangerous ? (
          <TriangleAlert size={11} />
        ) : (
          <Copy size={11} />
        )}
        {copied ? 'Copied' : (label ?? 'Copy')}
      </button>

      {confirming && (
        <div
          className="anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0/0.6)] p-6 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) setConfirming(false);
          }}
          onClick={(event) => event.preventDefault()}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm copying a destructive command"
            className="anim-palette w-full max-w-[480px] overflow-hidden rounded-lg bg-[var(--surface-overlay)]"
            style={{ boxShadow: 'var(--shadow-overlay)' }}
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-[10px]">
              <TriangleAlert size={14} className="text-[var(--danger)]" />
              <span className="label">{command.dangerLevel} command</span>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <p className="text-[12.5px] text-[var(--text-muted)]">
                {command.title} cannot be undone once it runs. Read it before you paste it.
              </p>
              <pre className="mono overflow-x-auto rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
                {command.command}
              </pre>
              {command.description && (
                <p className="text-[11.5px] text-[var(--text-faint)]">{command.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-4 py-[10px]">
              <Button variant="danger" onClick={() => void copy()}>
                Copy to clipboard
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">
                nothing is executed here
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
