'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import type { EntityRef, ProjectRef, TagRef } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';

/**
 * The frame every detail page shares: identity at the top, one column of
 * content, and the same two verbs in the same place. Consistency here is what
 * lets twenty record types feel like one application.
 */
export function DetailShell({
  title,
  eyebrow,
  meta,
  actions,
  onEdit,
  deletePath,
  deleteBackTo,
  deleteConfirm,
  width = '860px',
  children,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  onEdit?: () => void;
  deletePath?: string;
  deleteBackTo?: string;
  deleteConfirm?: string;
  width?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const remove = useAction(() => api(deletePath as string, { method: 'DELETE' }));

  return (
    <article className="mx-auto px-6 pb-16 pt-6" style={{ maxWidth: width }}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          {eyebrow && <div className="label mb-[3px]">{eyebrow}</div>}
          <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
          {meta && (
            <div className="mono mt-[6px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
              {meta}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onEdit && (
            <Button onClick={onEdit}>
              <Pencil size={13} /> Edit
            </Button>
          )}
          {deletePath && (
            <Button
              variant="danger"
              aria-label="Delete"
              disabled={remove.busy}
              onClick={async () => {
                if (
                  !window.confirm(deleteConfirm ?? 'Delete this record? This cannot be undone.')
                ) {
                  return;
                }
                await remove.run();
                router.push(deleteBackTo ?? '/');
              }}
            >
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </header>

      {children}
    </article>
  );
}

/* ── context panel building blocks ────────────────────────────────────────── */

export function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-[6px]">{title}</div>
      {children}
    </div>
  );
}

export function PanelDivider() {
  return <div className="h-px bg-[var(--line)]" />;
}

export function DefinitionList({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-[3px] text-[12px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-[var(--text-faint)]">{label}</dt>
          <dd className="min-w-0 truncate text-right text-[var(--text-muted)]">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectLink({ project }: { project: ProjectRef | null | undefined }) {
  if (!project) {
    return (
      <p className="text-[12px] text-[var(--text-faint)]">Unfiled — edit to attach a project.</p>
    );
  }
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent)]"
    >
      <span
        aria-hidden
        className="h-[10px] w-[2px] shrink-0 rounded-sm"
        style={{ background: project.color ?? 'var(--line-strong)' }}
      />
      {project.name}
    </Link>
  );
}

export function TagList({
  tags,
  href,
}: {
  tags: TagRef[] | undefined;
  href: (slug: string) => string;
}) {
  if (!tags || tags.length === 0) {
    return <p className="text-[12px] text-[var(--text-faint)]">No tags.</p>;
  }
  return (
    <div className="flex flex-wrap gap-[4px]">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={href(tag.slug)}
          className="mono rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--accent-line)]"
        >
          {tag.name}
        </Link>
      ))}
    </div>
  );
}

export function LinkedRecords({ links }: { links: EntityRef[] | undefined }) {
  if (!links || links.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-[var(--text-faint)]">
        Nothing linked yet. Any record can point at any other — a note at a deployment, a solution
        at a server.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-[3px]">
      {links.map((link) => (
        <li key={`${link.type}-${link.id}`}>
          <Link
            href={link.href}
            className="flex items-center justify-between gap-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            <span className="truncate">{link.label}</span>
            <span className="label shrink-0">{humanise(link.type)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Timestamps({
  created,
  updated,
  extra,
}: {
  created: string;
  updated: string;
  extra?: string[];
}) {
  return (
    <div className="mono flex flex-col gap-[3px] text-[11px] text-[var(--text-faint)]">
      <span>created {timeAgo(created)}</span>
      <span>updated {timeAgo(updated)}</span>
      {extra?.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

/* ── list-page cell helpers ───────────────────────────────────────────────── */

/** The project cell every list shares. */
export function ProjectCell({ project }: { project: ProjectRef | null | undefined }) {
  if (!project) return <span className="text-[11.5px] text-[var(--text-faint)]">Unfiled</span>;
  return (
    <span className="flex min-w-0 items-center gap-[6px]">
      <span
        aria-hidden
        className="h-[9px] w-[2px] shrink-0 rounded-sm"
        style={{ background: project.color ?? 'var(--line-strong)' }}
      />
      <span className="truncate text-[12px] text-[var(--text-muted)]">{project.name}</span>
    </span>
  );
}

export function MonoCell({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <span className={cx('mono truncate text-[11px] text-[var(--text-faint)]', className)}>
      {value || '—'}
    </span>
  );
}

export function TimeCell({ value }: { value: string | null | undefined }) {
  return (
    <span className="mono text-[11px] text-[var(--text-faint)]">
      {value ? timeAgo(value) : '—'}
    </span>
  );
}

export function IconLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon size={12} className="shrink-0 text-[var(--text-faint)]" />
      <span className="truncate text-[12.5px]">{children}</span>
    </span>
  );
}
