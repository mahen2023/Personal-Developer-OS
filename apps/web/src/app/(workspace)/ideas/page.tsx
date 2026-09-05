'use client';

import Link from 'next/link';
import { Lightbulb, Plus } from 'lucide-react';
import { IDEA_STATUS, PRIORITY, humanise, optionsOf } from '@/lib/domain';
import type { Idea } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { MonoCell, ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

export default function IdeasPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Idea>('/ideas', queryString);

  const columns: Column<Idea>[] = [
    {
      key: 'title',
      header: 'Idea',
      render: (idea) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{idea.title}</span>
          {idea.description && (
            <span className="truncate text-[11px] text-[var(--text-faint)]">
              {idea.description}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '130px',
      hideBelow: 'lg',
      render: (idea) => <MonoCell value={idea.category} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (idea) => <ProjectCell project={idea.project} />,
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '76px',
      hideBelow: 'sm',
      render: (idea) => <Badge signal={PRIORITY[idea.priority]}>{idea.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (idea) => (
        <StatusIndicator signal={IDEA_STATUS[idea.status]} label={humanise(idea.status)} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (idea) => <TimeCell value={idea.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Lightbulb}
        title="Ideas"
        subtitle="The backlog behind the backlog — things worth doing that nobody has committed to."
        count={data?.total}
        actions={
          <Link href="/ideas/new">
            <Button variant="primary">
              <Plus size={13} /> Capture idea
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles and descriptions…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(IDEA_STATUS, 'Any')}
        />
        <FilterSelect
          label="Priority"
          value={values.priority ?? ''}
          onChange={(priority) => set({ priority })}
          options={optionsOf(PRIORITY, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(idea) => `/ideas/${idea.id}`}
        empty={
          <EmptyState
            icon={Lightbulb}
            title={values.q ? 'Nothing matches' : 'No ideas captured'}
            description={
              values.q
                ? 'No idea matches those filters.'
                : 'Somewhere to put the thought you had in the shower, so it stops taking up space until you decide about it.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'idea through researching, planned, building',
                    'priority, so the good ones surface',
                  ]
            }
            action={
              <Link href="/ideas/new">
                <Button variant="primary">
                  <Plus size={13} /> Capture an idea
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
