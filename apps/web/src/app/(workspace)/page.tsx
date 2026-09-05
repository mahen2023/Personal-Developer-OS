'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  CheckCircle2,
  Database,
  FolderGit2,
  Globe,
  ListChecks,
  Lock,
  Notebook,
  Rocket,
  Server,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx, dayLabel, clockTime, timeAgo } from '@/lib/format';
import type { ActivityEntry, AttentionItem, DashboardCounts, Paged } from '@/lib/types';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import {
  Counter,
  EmptyState,
  ExpiryIndicator,
  Skeleton,
  StatusIndicator,
} from '@/components/primitives';

const OVERVIEW: { key: keyof DashboardCounts; label: string; href: string; icon: typeof Boxes }[] =
  [
    { key: 'activeProjects', label: 'Active projects', href: '/projects', icon: Boxes },
    { key: 'repositories', label: 'Repositories', href: '/repositories', icon: FolderGit2 },
    { key: 'servers', label: 'Servers', href: '/servers', icon: Server },
    { key: 'databases', label: 'Databases', href: '/databases', icon: Database },
    { key: 'domains', label: 'Domains', href: '/domains', icon: Globe },
    { key: 'openTasks', label: 'Open tasks', href: '/tasks', icon: ListChecks },
    { key: 'notes', label: 'Notes', href: '/notes', icon: Notebook },
    { key: 'vaultItems', label: 'Vault items', href: '/vault', icon: Lock },
  ];

export default function DashboardPage() {
  const { summary, loading, user } = useWorkspace();
  const activity = useActivity();
  const counts = summary?.counts;
  const isEmpty = counts ? Object.values(counts).every((value) => value === 0) : false;

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">
            {greeting()}
            {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-[2px] text-[12.5px] text-[var(--text-muted)]">
            {summarySentence(summary?.attention.length ?? 0, counts?.overdueTasks ?? 0)}
          </p>
        </div>
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </header>

      {isEmpty ? (
        <FirstRun />
      ) : (
        <>
          <Overview counts={counts} loading={loading} />

          <Panel title="Needs attention" className="mt-6">
            {loading ? (
              <RowSkeletons />
            ) : summary && summary.attention.length > 0 ? (
              <ul className="stagger">
                {summary.attention.slice(0, 8).map((item) => (
                  <AttentionRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </ul>
            ) : (
              <Reassurance />
            )}
          </Panel>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <Panel title="Recent work">
              {loading ? (
                <RowSkeletons />
              ) : (
                <ul className="stagger">
                  {summary?.recent.projects.map((project) => (
                    <RecentRow
                      key={project.id}
                      href={`/projects/${project.slug}`}
                      icon={<Boxes size={13} />}
                      title={project.name}
                      meta={project.status.toLowerCase()}
                      at={project.updatedAt}
                    />
                  ))}
                  {summary?.recent.notes.map((note) => (
                    <RecentRow
                      key={note.id}
                      href={`/notes/${note.id}`}
                      icon={<Notebook size={13} />}
                      title={note.title}
                      meta={note.type.toLowerCase()}
                      at={note.updatedAt}
                    />
                  ))}
                  {summary?.recent.deployments.map((deployment) => (
                    <RecentRow
                      key={deployment.id}
                      href={`/deployments/${deployment.id}`}
                      icon={<Rocket size={13} />}
                      title={deployment.version ?? 'Deployment'}
                      meta={deployment.status.toLowerCase()}
                      at={deployment.deployedAt}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Activity">
              <ActivityTimeline entries={activity} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Overview({ counts, loading }: { counts?: DashboardCounts; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded border border-line bg-[var(--surface-raised)] sm:grid-cols-4">
      {OVERVIEW.map((cell, index) => (
        <Link
          key={cell.key}
          href={cell.href}
          className={cx(
            'group flex flex-col gap-[6px] px-4 py-[14px] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)]',
            // Hairline grid, drawn with borders rather than gaps so the block
            // reads as one instrument rather than eight cards.
            'border-line',
            index % 2 === 0 ? 'border-r sm:border-r' : '',
            index % 4 !== 3 ? 'sm:border-r' : 'sm:border-r-0',
            index < OVERVIEW.length - 2 ? 'border-b' : '',
            index < 4 ? 'sm:border-b' : 'sm:border-b-0',
          )}
        >
          <span className="label flex items-center gap-[6px]">
            <cell.icon
              size={11}
              className="text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent)]"
            />
            {cell.label}
          </span>
          <span className="text-[22px] font-semibold leading-none tracking-[-0.02em]">
            {loading || !counts ? (
              <Skeleton className="h-[20px] w-10" />
            ) : (
              <Counter value={counts[cell.key]} />
            )}
          </span>
        </Link>
      ))}
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const signal =
    item.severity === 'CRITICAL' ? 'danger' : item.severity === 'WARNING' ? 'warning' : 'info';
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-[10px] last:border-b-0">
      <StatusIndicator signal={signal} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px]">{item.title}</div>
        <div className="mono text-[11px] text-[var(--text-faint)]">
          {item.kind.replace(/_/g, ' ').toLowerCase()} · {item.detail}
        </div>
      </div>
      <ExpiryIndicator daysLeft={item.daysLeft} />
    </li>
  );
}

function Reassurance() {
  return (
    <div className="flex items-center gap-3 px-4 py-5">
      <CheckCircle2 size={15} className="text-[var(--success)]" />
      <div>
        <div className="text-[12.5px]">Nothing needs your attention</div>
        <div className="text-[11.5px] text-[var(--text-faint)]">
          No certificates or domains expiring in the next 45 days, and no overdue tasks.
        </div>
      </div>
    </div>
  );
}

function RecentRow({
  href,
  icon,
  title,
  meta,
  at,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  at: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-line px-4 py-[9px] transition-colors duration-[var(--fast)] last:border-b-0 hover:bg-[var(--surface-hover)]"
      >
        <span className="text-[var(--text-faint)]">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{title}</span>
        <span className="mono text-[11px] text-[var(--text-faint)]">{meta}</span>
        <span className="mono w-[76px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
          {timeAgo(at)}
        </span>
      </Link>
    </li>
  );
}

/** Time-gutter timeline (§9) — the day is a heading, the time is a fixed column. */
function ActivityTimeline({ entries }: { entries: ActivityEntry[] | null }) {
  if (entries === null) return <RowSkeletons />;
  if (entries.length === 0) {
    return (
      <p className="px-4 py-5 text-[12px] text-[var(--text-faint)]">
        Every create, update and deploy lands here. Nothing has happened yet.
      </p>
    );
  }

  let currentDay = '';
  return (
    <div className="stagger py-1">
      {entries.map((entry) => {
        const day = dayLabel(entry.createdAt);
        const showDay = day !== currentDay;
        currentDay = day;
        return (
          <div key={entry.id}>
            {showDay && <div className="label px-4 pb-1 pt-3">{day}</div>}
            <div className="flex gap-3 px-4 py-[5px]">
              <span className="mono w-[38px] shrink-0 pt-[1px] text-[11px] text-[var(--text-faint)]">
                {clockTime(entry.createdAt)}
              </span>
              <span className="relative flex w-[9px] shrink-0 justify-center">
                <span className="absolute top-[6px] h-[5px] w-[5px] rounded-full bg-[var(--line-strong)]" />
                <span className="mt-[11px] w-px flex-1 bg-[var(--line)]" />
              </span>
              <span className="min-w-0 flex-1 pb-1 text-[12.5px] text-[var(--text-muted)]">
                {entry.summary}
                {entry.project && (
                  <Link
                    href={`/projects/${entry.project.slug}`}
                    className="mono ml-2 text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)]"
                  >
                    {entry.project.name}
                  </Link>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'overflow-hidden rounded border border-line bg-[var(--surface-raised)]',
        className,
      )}
    >
      <div className="label flex h-8 items-center border-b border-line px-4">{title}</div>
      {children}
    </section>
  );
}

function RowSkeletons() {
  return (
    <div className="flex flex-col gap-[10px] p-4">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-[14px]" style={{ width: `${88 - row * 16}%` }} />
      ))}
    </div>
  );
}

function FirstRun() {
  return (
    <div className="rounded border border-line bg-[var(--surface-raised)]">
      <EmptyState
        icon={Boxes}
        title="Your workspace is empty"
        description="Everything here hangs off a project. Create one and start connecting the things that belong to it."
        connects={[
          'repositories, servers, databases',
          'environments, domains, certificates',
          'notes, tasks, solutions, documents',
          'secrets, kept in the vault',
        ]}
        action={
          <Link
            href="/projects/new"
            className="inline-flex h-[30px] items-center rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[11px] text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
          >
            Create your first project
          </Link>
        }
      />
    </div>
  );
}

/* ── data ─────────────────────────────────────────────────────────────────── */

function useActivity(): ActivityEntry[] | null {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  useEffect(() => {
    api<Paged<ActivityEntry>>('/activities?limit=12')
      .then((result) => setEntries(result.items))
      .catch(() => setEntries([]));
  }, []);
  return entries;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function summarySentence(attention: number, overdue: number): string {
  if (attention === 0 && overdue === 0) return 'Nothing is expiring and nothing is overdue.';
  const parts: string[] = [];
  if (attention > 0) parts.push(`${attention} item${attention === 1 ? '' : 's'} need review`);
  if (overdue > 0) parts.push(`${overdue} task${overdue === 1 ? '' : 's'} overdue`);
  return `${parts.join(' · ')}.`;
}
