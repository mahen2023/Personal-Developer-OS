'use client';

import Link from 'next/link';
import { Boxes, Plus, Star } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { PRIORITY, PROJECT_STATUS, humanise, optionsOf } from '@/lib/domain';
import type { Project } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState, ProgressBar, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  FilterToggle,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';

export default function ProjectsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Project>('/projects', queryString);

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      render: (project) => (
        <span className="flex min-w-0 items-center gap-2">
          {project.isFavorite && <Star size={11} className="shrink-0 text-[var(--accent)]" />}
          <span
            aria-hidden
            className="h-[10px] w-[2px] shrink-0 rounded-sm"
            style={{ background: project.color ?? 'var(--line-strong)' }}
          />
          <span className="truncate text-[12.5px]">{project.name}</span>
          {project.client && (
            <span className="mono hidden shrink-0 text-[11px] text-[var(--text-faint)] lg:inline">
              {project.client}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'stack',
      header: 'Stack',
      width: '190px',
      hideBelow: 'lg',
      render: (project) => (
        <span className="mono truncate text-[11px] text-[var(--text-faint)]">
          {project.techStack.slice(0, 3).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '92px',
      hideBelow: 'md',
      render: (project) => <ProgressBar value={project.progress} />,
    },
    {
      key: 'connected',
      header: 'Connected',
      width: '104px',
      hideBelow: 'xl',
      render: (project) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {Object.values(project.counts).reduce((sum, count) => sum + count, 0)} records
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '78px',
      hideBelow: 'sm',
      render: (project) => <Badge signal={PRIORITY[project.priority]}>{project.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '104px',
      render: (project) => (
        <StatusIndicator signal={PROJECT_STATUS[project.status]} label={humanise(project.status)} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '86px',
      align: 'right',
      hideBelow: 'md',
      render: (project) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {timeAgo(project.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Boxes}
        title="Projects"
        subtitle="Everything else hangs off one of these."
        count={data?.total}
        actions={
          <Link href="/projects/new">
            <Button variant="primary">
              <Plus size={13} /> New project
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Filter by name, description or client…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(PROJECT_STATUS, 'Any')}
        />
        <FilterSelect
          label="Priority"
          value={values.priority ?? ''}
          onChange={(priority) => set({ priority })}
          options={optionsOf(PRIORITY, 'Any')}
        />
        <FilterToggle
          label="Favourites"
          icon={Star}
          active={values.favorite === 'true'}
          onChange={(on) => set({ favorite: on ? 'true' : undefined })}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(project) => `/projects/${project.slug}`}
        empty={
          <EmptyState
            icon={Boxes}
            title={values.q || values.status ? 'Nothing matches' : 'No projects yet'}
            description={
              values.q || values.status
                ? 'No project matches those filters. Clear them to see everything.'
                : 'A project is the hub: create one, then connect the repositories, servers, notes and secrets that belong to it.'
            }
            connects={
              values.q || values.status
                ? undefined
                : [
                    'repositories, servers, databases',
                    'environments, domains, certificates',
                    'notes, tasks, solutions, documents',
                  ]
            }
            action={
              <Link href="/projects/new">
                <Button variant="primary">
                  <Plus size={13} /> Create a project
                </Button>
              </Link>
            }
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
    </div>
  );
}
