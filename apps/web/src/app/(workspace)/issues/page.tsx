'use client';

import Link from 'next/link';
import { Plus, TriangleAlert } from 'lucide-react';
import { ISSUE_STATUS, PRIORITY, humanise, optionsOf } from '@/lib/domain';
import type { Issue } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState, StatusIndicator } from '@/components/primitives';
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
import { MonoCell, ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

export default function IssuesPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Issue>('/issues', queryString);
  const filtered = Boolean(values.q || values.status || values.open);

  const columns: Column<Issue>[] = [
    {
      key: 'title',
      header: 'Issue',
      render: (issue) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{issue.title}</span>
          {issue.errorMessage && (
            <span className="mono truncate text-[11px] text-[var(--danger)]">
              {issue.errorMessage}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'solution',
      header: 'Fixed by',
      width: '180px',
      hideBelow: 'lg',
      render: (issue) => <MonoCell value={issue.solution?.title} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (issue) => <ProjectCell project={issue.project} />,
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '76px',
      hideBelow: 'sm',
      render: (issue) => <Badge signal={PRIORITY[issue.priority]}>{issue.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (issue) => (
        <StatusIndicator signal={ISSUE_STATUS[issue.status]} label={humanise(issue.status)} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (issue) => <TimeCell value={issue.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={TriangleAlert}
        title="Issues"
        subtitle="What is broken now. Closing one writes down the fix."
        count={data?.total}
        actions={
          <Link href="/issues/new">
            <Button variant="primary">
              <Plus size={13} /> New issue
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, descriptions and error text…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(ISSUE_STATUS, 'Any')}
        />
        <FilterSelect
          label="Priority"
          value={values.priority ?? ''}
          onChange={(priority) => set({ priority })}
          options={optionsOf(PRIORITY, 'Any')}
        />
        <FilterToggle
          label="Still open"
          active={values.open === 'true'}
          onChange={(on) => set({ open: on ? 'true' : undefined })}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(issue) => `/issues/${issue.id}`}
        empty={
          <EmptyState
            icon={TriangleAlert}
            title={filtered ? 'Nothing matches' : 'Nothing is broken'}
            description={
              filtered
                ? 'No issue matches those filters.'
                : 'Log a problem while you are still in it. When you close it, the fix becomes a solution you can find again.'
            }
            connects={
              filtered
                ? undefined
                : [
                    'the error message, verbatim',
                    'suggestions from solutions you already have',
                    'closing it records the fix, not just the outcome',
                  ]
            }
            action={
              <Link href="/issues/new">
                <Button variant="primary">
                  <Plus size={13} /> Log an issue
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
