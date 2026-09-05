'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, type LucideIcon, Search, X } from 'lucide-react';
import { cx } from '@/lib/format';
import { Button, Skeleton } from '@/components/primitives';

/* ── page chrome ──────────────────────────────────────────────────────────── */

/**
 * Every module page opens the same way: what this is, how much of it there is,
 * and the one action worth taking. Consistency here is what makes 20 modules
 * feel like one application rather than 20 screens.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  count,
  actions,
  views,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  count?: number;
  actions?: React.ReactNode;
  views?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-[var(--surface-raised)]">
            <Icon size={15} strokeWidth={1.7} className="text-[var(--text-muted)]" />
          </span>
        )}
        <div>
          <h1 className="flex items-baseline gap-2 text-[17px] font-semibold tracking-[-0.01em]">
            {title}
            {typeof count === 'number' && (
              <span className="num text-[12px] font-normal text-[var(--text-faint)]">{count}</span>
            )}
          </h1>
          {subtitle && (
            <p className="mt-[1px] text-[12.5px] text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {views}
        {actions}
      </div>
    </header>
  );
}

/** Segmented control for list / board / timeline (§13). */
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: LucideIcon }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-line">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          title={option.label}
          aria-pressed={value === option.value}
          className={cx(
            'flex h-[28px] items-center gap-[6px] border-r border-line px-[9px] text-[12px] transition-colors duration-[var(--fast)] last:border-r-0',
            value === option.value
              ? 'bg-[var(--surface-active)] text-[var(--text)]'
              : 'bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]',
          )}
        >
          <option.icon size={12} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── filtering ────────────────────────────────────────────────────────────── */

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
      {children}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Filter…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex h-[28px] min-w-[180px] flex-1 items-center gap-2 rounded border border-line bg-[var(--surface-raised)] px-[8px] focus-within:border-[var(--accent-line)]">
      <Search size={12} className="shrink-0 text-[var(--text-faint)]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--text-faint)]"
      />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear filter" className="shrink-0">
          <X size={12} className="text-[var(--text-faint)] hover:text-[var(--text)]" />
        </button>
      )}
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-[28px] items-center gap-[6px] rounded border border-line bg-[var(--surface-raised)] pl-[8px] pr-[4px] focus-within:border-[var(--accent-line)]">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-full bg-transparent pr-1 text-[12.5px] text-[var(--text)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-raised)]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A filter that is on or off — "overdue", "pinned", "favourites". */
export function FilterToggle({
  label,
  active,
  onChange,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onChange: (active: boolean) => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      onClick={() => onChange(!active)}
      aria-pressed={active}
      className={cx(
        'flex h-[28px] items-center gap-[6px] rounded border px-[9px] text-[12px] transition-colors duration-[var(--fast)]',
        active
          ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
          : 'border-line bg-[var(--surface-raised)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
      )}
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

/* ── rows ─────────────────────────────────────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: string;
  /** Fixed width, e.g. '90px'. Omit for the flexible column. */
  width?: string;
  align?: 'left' | 'right';
  /** Hidden below this breakpoint, so dense tables still work on a laptop. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  render: (row: T) => React.ReactNode;
}

const HIDE_CLASS = {
  sm: 'hidden sm:flex',
  md: 'hidden md:flex',
  lg: 'hidden lg:flex',
  xl: 'hidden xl:flex',
} as const;

/**
 * The width below which a dense row stops being readable and starts scrolling.
 *
 * `hideBelow` drops columns by viewport width, but the *available* width is
 * smaller than that — the navigation rail and the context panel both take a
 * bite. Without a floor the flexible first column is the one that collapses,
 * which hides exactly the thing the row is named after.
 */
const ROW_MIN_WIDTH = '740px';

/**
 * Dense hairline rows, not cards. Each row is a link, so middle-click and
 * "open in new tab" work the way they do everywhere else.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  href,
  loading,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  href: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="overflow-x-auto rounded border border-line bg-[var(--surface-raised)]">
        <HeaderRow columns={columns} />
        <div className="flex flex-col gap-[10px] p-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-[13px]" style={{ width: `${92 - row * 9}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="rounded border border-line bg-[var(--surface-raised)]">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto rounded border border-line bg-[var(--surface-raised)]">
      <HeaderRow columns={columns} />
      <div className="stagger">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={href(row)}
            style={{ minWidth: ROW_MIN_WIDTH }}
            className="flex items-center gap-3 border-b border-line px-3 py-[7px] transition-colors duration-[var(--fast)] last:border-b-0 hover:bg-[var(--surface-hover)]"
          >
            {columns.map((column) => (
              <span
                key={column.key}
                className={cx(
                  'min-w-0 items-center',
                  column.width ? 'shrink-0' : 'flex-1',
                  column.align === 'right' && 'justify-end text-right',
                  column.hideBelow ? HIDE_CLASS[column.hideBelow] : 'flex',
                )}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.render(row)}
              </span>
            ))}
          </Link>
        ))}
      </div>
    </div>
  );
}

function HeaderRow<T>({ columns }: { columns: Column<T>[] }) {
  return (
    <div
      style={{ minWidth: ROW_MIN_WIDTH }}
      className="flex items-center gap-3 border-b border-line bg-[var(--surface-sunken)] px-3 py-[6px]"
    >
      {columns.map((column) => (
        <span
          key={column.key}
          className={cx(
            'label min-w-0',
            column.width ? 'shrink-0' : 'flex-1',
            column.align === 'right' && 'text-right',
            column.hideBelow ? HIDE_CLASS[column.hideBelow] : 'block',
          )}
          style={column.width ? { width: column.width } : undefined}
        >
          {column.header}
        </span>
      ))}
    </div>
  );
}

/* ── paging ───────────────────────────────────────────────────────────────── */

export function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) {
    return (
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
        {total} {total === 1 ? 'record' : 'records'}
      </p>
    );
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <Button onClick={() => onChange(page - 1)} disabled={page <= 1} variant="ghost">
        <ChevronLeft size={13} /> Previous
      </Button>
      <span className="mono text-[11.5px] text-[var(--text-faint)]">
        {page} / {pages} · {total} records
      </span>
      <Button onClick={() => onChange(page + 1)} disabled={page >= pages} variant="ghost">
        Next <ChevronRight size={13} />
      </Button>
    </div>
  );
}
