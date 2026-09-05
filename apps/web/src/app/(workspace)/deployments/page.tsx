'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GitCommitHorizontal, Plus, Rocket, Rows3, Waypoints } from 'lucide-react';
import { api } from '@/lib/api';
import { clockTime, cx, timeAgo } from '@/lib/format';
import { DEPLOYMENT_STATUS, humanise, optionsOf } from '@/lib/domain';
import type { Deployment, DeploymentTimeline } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState, LoadingLine, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
  ViewSwitch,
} from '@/components/patterns/PageShell';
import { MonoCell, ProjectCell } from '@/components/patterns/DetailShell';

type View = 'timeline' | 'list';

export default function DeploymentsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const view = (values.view as View) ?? 'timeline';

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Rocket}
        title="Deployments"
        subtitle="What went out, where it went, and whether it stayed."
        views={
          <ViewSwitch
            value={view}
            onChange={(next) => set({ view: next === 'timeline' ? undefined : next })}
            options={[
              { value: 'timeline', label: 'Timeline', icon: Waypoints },
              { value: 'list', label: 'List', icon: Rows3 },
            ]}
          />
        }
        actions={
          <Link href="/deployments/new">
            <Button variant="primary">
              <Plus size={13} /> Record deployment
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search versions, commits and notes…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(DEPLOYMENT_STATUS, 'Any')}
        />
      </Toolbar>

      {view === 'timeline' ? (
        <TimelineView queryString={queryString} />
      ) : (
        <ListView queryString={queryString} set={set} />
      )}
    </div>
  );
}

/* ── timeline ─────────────────────────────────────────────────────────────── */

function TimelineView({ queryString }: { queryString: string }) {
  const [timeline, setTimeline] = useState<DeploymentTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<DeploymentTimeline>(`/deployments/timeline${queryString ? `?${queryString}` : ''}`)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setLoading(false));
  }, [queryString]);

  if (loading && !timeline) return <LoadingLine message="Building the release history…" />;

  if (!timeline || timeline.days.length === 0) {
    return (
      <div className="rounded border border-line bg-[var(--surface-raised)]">
        <EmptyState
          icon={Rocket}
          title="Nothing deployed yet"
          description="Record a release and this becomes the history you check when something starts misbehaving — what shipped, when, and whether it was rolled back."
          connects={[
            'version, commit and who deployed it',
            'the environment and server it went to',
            'success, failure or rollback — and how long it took',
          ]}
          action={
            <Link href="/deployments/new">
              <Button variant="primary">
                <Plus size={13} /> Record a deployment
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <section className="mb-4 grid grid-cols-2 overflow-hidden rounded border border-line bg-[var(--surface-raised)] sm:grid-cols-4">
        <Stat label="Releases" value={String(timeline.stats.total)} />
        <Stat label="Succeeded" value={String(timeline.stats.succeeded)} signal="success" />
        <Stat label="Failed" value={String(timeline.stats.failed)} signal="danger" />
        <Stat
          label="Success rate"
          value={timeline.stats.successRate === null ? '—' : `${timeline.stats.successRate}%`}
          last
        />
      </section>

      <div className="stagger overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        {timeline.days.map((day) => (
          <div key={day.date} className="flex gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <div className="w-[92px] shrink-0">
              <div className="mono text-[11.5px] text-[var(--text-muted)]">
                {new Date(day.date).toLocaleDateString([], {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
              <div className="label mt-[2px]">{timeAgo(day.date)}</div>
            </div>

            <ul className="flex min-w-0 flex-1 flex-col gap-[2px]">
              {day.deployments.map((deployment) => (
                <li key={deployment.id}>
                  <Link
                    href={`/deployments/${deployment.id}`}
                    className="flex items-center gap-3 rounded px-2 py-[5px] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)]"
                  >
                    <span className="mono w-[38px] shrink-0 text-[11px] text-[var(--text-faint)]">
                      {clockTime(deployment.deployedAt)}
                    </span>
                    <StatusIndicator signal={DEPLOYMENT_STATUS[deployment.status]} />
                    <span className="mono min-w-0 flex-1 truncate text-[12.5px]">
                      {deployment.version ?? 'unversioned'}
                    </span>
                    {deployment.commitSha && (
                      <span className="mono hidden shrink-0 items-center gap-[4px] text-[11px] text-[var(--text-faint)] lg:flex">
                        <GitCommitHorizontal size={11} />
                        {deployment.commitSha.slice(0, 7)}
                      </span>
                    )}
                    {deployment.environment && <Badge>{deployment.environment.type}</Badge>}
                    <span className="mono hidden w-[110px] shrink-0 truncate text-right text-[11px] text-[var(--text-faint)] md:inline">
                      {deployment.project?.name ?? ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  signal,
  last,
}: {
  label: string;
  value: string;
  signal?: 'success' | 'danger';
  last?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-[5px] border-b border-line px-4 py-3 sm:border-b-0',
        !last && 'border-r',
      )}
    >
      <span className="label">{label}</span>
      <span
        className="num text-[18px] font-semibold leading-none"
        style={signal ? { color: `var(--${signal})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/* ── list ─────────────────────────────────────────────────────────────────── */

function ListView({
  queryString,
  set,
}: {
  queryString: string;
  set: (patch: Record<string, string | undefined>) => void;
}) {
  const { data, loading } = useList<Deployment>('/deployments', queryString);

  const columns: Column<Deployment>[] = [
    {
      key: 'version',
      header: 'Release',
      render: (deployment) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="mono truncate text-[12.5px]">{deployment.version ?? 'unversioned'}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {deployment.commitSha?.slice(0, 12) ?? ''}
          </span>
        </span>
      ),
    },
    {
      key: 'repository',
      header: 'Repository',
      width: '150px',
      hideBelow: 'lg',
      render: (deployment) => <MonoCell value={deployment.repository?.name} />,
    },
    {
      key: 'target',
      header: 'Target',
      width: '160px',
      hideBelow: 'md',
      render: (deployment) => (
        <MonoCell
          value={[deployment.environment?.name, deployment.server?.name]
            .filter(Boolean)
            .join(' / ')}
        />
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '130px',
      hideBelow: 'xl',
      render: (deployment) => <ProjectCell project={deployment.project} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '124px',
      render: (deployment) => (
        <StatusIndicator
          signal={DEPLOYMENT_STATUS[deployment.status]}
          label={humanise(deployment.status)}
        />
      ),
    },
    {
      key: 'when',
      header: 'When',
      width: '84px',
      align: 'right',
      render: (deployment) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {timeAgo(deployment.deployedAt)}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(deployment) => `/deployments/${deployment.id}`}
        empty={
          <EmptyState
            icon={Rocket}
            title="Nothing matches"
            description="No deployment matches those filters."
          />
        }
      />
      {data && (
        <Pager
          page={data.page}
          pages={data.pages}
          total={data.total}
          onChange={(page) => set({ page: String(page) })}
        />
      )}
    </>
  );
}
