'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cx } from '@/lib/format';

/**
 * The action row that sits under a turn.
 *
 * Icons only, with the name in a tooltip. A row of five labelled buttons under
 * every message competes with the message; a row of five glyphs is furniture
 * you stop seeing until you want it. The same set appears on both speakers, so
 * the position of an icon means the same thing wherever you are in the thread.
 *
 * Every action reports back. A click that produces no visible change is
 * indistinguishable from a click that missed, which is most of what "the
 * actions do not work reliably" turns out to mean — so a copy shows a tick, a
 * regeneration spins, and a save confirms.
 */

export interface ActionState {
  /** Running now: the icon spins and the button stops accepting clicks. */
  busy?: boolean;
  /** Just finished: a tick replaces the icon for a moment. */
  done?: boolean;
}

export function ActionRow({
  visible,
  children,
}: {
  /** Always-visible rows exist for the turn being read; the rest reveal. */
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        'mt-[6px] flex items-center gap-[2px] transition-opacity duration-[var(--fast)]',
        // Focus-within keeps this reachable by keyboard, which hover alone
        // never is.
        visible ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
      )}
    >
      {children}
    </div>
  );
}

export function IconAction({
  icon: Icon,
  label,
  onClick,
  busy,
  done,
  disabled,
  tone = 'default',
}: {
  icon: LucideIcon;
  /** Shown in the tooltip and used as the accessible name. */
  label: string;
  onClick: () => void;
  busy?: boolean;
  done?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <span className="relative inline-flex [&:hover>span]:opacity-100 [&:focus-within>span]:opacity-100">
      <button
        type="button"
        aria-label={label}
        disabled={disabled || busy}
        onClick={onClick}
        className={cx(
          'inline-flex h-[26px] w-[26px] items-center justify-center rounded transition-colors duration-[var(--fast)]',
          'text-[var(--text-faint)] hover:bg-[var(--surface-hover)]',
          tone === 'danger' ? 'hover:text-[var(--danger)]' : 'hover:text-[var(--text)]',
          done && 'text-[var(--success)]',
          (disabled || busy) && 'cursor-default opacity-45 hover:bg-transparent',
        )}
      >
        {done ? (
          <Check size={13} />
        ) : (
          <Icon
            size={13}
            className={busy ? 'animate-spin' : undefined}
            style={busy ? { animationDuration: '1.1s' } : undefined}
          />
        )}
      </button>

      {/* A tooltip, not a `title`: the native one waits a second and cannot be
          styled to match anything. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+4px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-[var(--surface-overlay)] px-[6px] py-[3px] text-[10.5px] text-[var(--text-muted)] opacity-0 transition-opacity duration-[var(--fast)]"
      >
        {done ? 'Done' : label}
      </span>
    </span>
  );
}

/**
 * Marks an action as finished for a moment, then forgets.
 *
 * The timer is cleared on unmount because a transcript re-renders constantly
 * while a stream is running, and a stray setState after unmount is a warning in
 * the console for a tick nobody sees.
 */
export function useConfirmation(ms = 1600): [boolean, () => void] {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [
    done,
    () => {
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), ms);
    },
  ];
}
