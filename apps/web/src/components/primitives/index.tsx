'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx, expiryPhrase } from '@/lib/format';

/* ── keyboard hints ────────────────────────────────────────────────────────
   Shortcuts are advertised everywhere in this app, so the key cap is a
   primitive rather than an ad-hoc <kbd> per site.                           */

export function KeyHint({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-[3px]', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="mono flex h-[17px] min-w-[17px] items-center justify-center rounded-sm border border-line bg-[var(--surface-hover)] px-[4px] text-[10px] leading-none text-[var(--text-faint)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/* ── status ───────────────────────────────────────────────────────────────── */

export type Signal = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'security';

export const SIGNAL_COLOR: Record<Signal, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  security: 'var(--security)',
  neutral: 'var(--text-faint)',
};

/** The dot that carries every "is it up / is it fine" answer in the app. */
export function StatusIndicator({
  signal,
  label,
  pulse = false,
  className,
}: {
  signal: Signal;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('inline-flex items-center gap-[6px]', className)}>
      <span className="relative flex h-[7px] w-[7px] shrink-0">
        {pulse && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              color: SIGNAL_COLOR[signal],
              animation: 'pulse-ring 2.4s var(--ease) infinite',
            }}
          />
        )}
        <span className="h-full w-full rounded-full" style={{ background: SIGNAL_COLOR[signal] }} />
      </span>
      {label && <span className="text-[12px] text-[var(--text-muted)]">{label}</span>}
    </span>
  );
}

/** Three-state expiry read-out for domains, certificates and deadlines (§20). */
export function ExpiryIndicator({ daysLeft }: { daysLeft: number | null }) {
  const signal: Signal =
    daysLeft === null
      ? 'neutral'
      : daysLeft <= 7
        ? 'danger'
        : daysLeft <= 14
          ? 'warning'
          : 'success';
  const state =
    daysLeft === null
      ? 'UNKNOWN'
      : daysLeft <= 7
        ? 'CRITICAL'
        : daysLeft <= 14
          ? 'WARNING'
          : 'VALID';
  return (
    <span className="inline-flex flex-col items-start gap-[1px]">
      <span className="label" style={{ color: SIGNAL_COLOR[signal] }}>
        {state}
      </span>
      <span className="text-[12px] text-[var(--text-muted)]">{expiryPhrase(daysLeft)}</span>
    </span>
  );
}

export function Badge({
  children,
  signal = 'neutral',
}: {
  children: React.ReactNode;
  signal?: Signal;
}) {
  return (
    <span
      className="label inline-flex items-center rounded-sm px-[5px] py-[2px]"
      style={{
        color: SIGNAL_COLOR[signal],
        background: `color-mix(in srgb, ${SIGNAL_COLOR[signal]} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/* ── numbers ──────────────────────────────────────────────────────────────── */

/**
 * Counts up on mount (§5). Uses one rAF loop and respects reduced motion by
 * rendering the final value immediately.
 */
export function Counter({ value, duration = 650 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = previous.current;
    previous.current = value;
    if (reduced || from === value) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out cubic: fast arrival, gentle settle
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="num tabular-nums">{display}</span>;
}

/** A rule, not a rounded pill — progress is a measurement, not a decoration. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('flex w-full items-center gap-2', className)}>
      <span className="h-[3px] flex-1 overflow-hidden rounded-sm bg-[var(--surface-active)]">
        <span
          className="block h-full rounded-sm bg-[var(--accent)] transition-[width] duration-[var(--slow)] ease-[var(--ease)]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span className="num w-[26px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
        {value}%
      </span>
    </span>
  );
}

/* ── loading + empty ──────────────────────────────────────────────────────── */

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cx('skeleton', className)} style={style} />;
}

/** Contextual loading copy beats a spinner (§56). */
export function LoadingLine({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-[var(--text-faint)]">
      <span
        className="h-[6px] w-[6px] rounded-full bg-[var(--accent)]"
        style={{ animation: 'pulse-ring 1.6s var(--ease) infinite', color: 'var(--accent)' }}
      />
      {message}
    </div>
  );
}

/**
 * Empty states explain what the screen is *for* and offer the next action —
 * never "No data found" (§55).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  connects,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  connects?: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="anim-enter mx-auto flex max-w-[420px] flex-col items-start gap-3 px-6 py-14">
      <span className="flex h-9 w-9 items-center justify-center rounded border border-line bg-[var(--surface-raised)]">
        <Icon size={16} strokeWidth={1.6} className="text-[var(--text-faint)]" />
      </span>
      <div>
        <h2 className="label mb-1">{title}</h2>
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>
      </div>
      {connects && connects.length > 0 && (
        <ul className="mono flex flex-col gap-[2px] text-[var(--text-faint)]">
          {connects.map((entry) => (
            <li key={entry} className="flex items-center gap-2">
              <span className="h-px w-3 bg-[var(--line-strong)]" />
              {entry}
            </li>
          ))}
        </ul>
      )}
      {action}
    </div>
  );
}

/* ── buttons ──────────────────────────────────────────────────────────────── */

export function Button({
  children,
  variant = 'default',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
}) {
  const styles = {
    default:
      'border border-line bg-[var(--surface-raised)] text-[var(--text)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]',
    primary:
      'border border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]',
    ghost:
      'border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
    danger:
      'border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-dim)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]',
  }[variant];

  return (
    <button
      {...props}
      className={cx(
        'inline-flex h-[30px] items-center gap-[6px] rounded px-[10px] text-[12px] font-medium transition-colors duration-[var(--fast)] disabled:cursor-not-allowed disabled:opacity-45',
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}
