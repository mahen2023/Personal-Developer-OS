'use client';

import Link from 'next/link';
import { GraduationCap, Plus } from 'lucide-react';
import { LEARNING_KINDS, LEARNING_STATUS, enumOptions, humanise, optionsOf } from '@/lib/domain';
import type { LearningItem } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState, ProgressBar, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { MonoCell, TimeCell } from '@/components/patterns/DetailShell';

export default function LearningPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<LearningItem>('/learning', queryString);

  const columns: Column<LearningItem>[] = [
    {
      key: 'title',
      header: 'What',
      render: (item) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{item.title}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {[humanise(item.kind), item.technology].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'technology',
      header: 'Technology',
      width: '150px',
      hideBelow: 'lg',
      render: (item) => <MonoCell value={item.technology} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '110px',
      hideBelow: 'md',
      render: (item) => <ProgressBar value={item.progress} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '138px',
      render: (item) => (
        <StatusIndicator signal={LEARNING_STATUS[item.status]} label={humanise(item.status)} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (item) => <TimeCell value={item.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={GraduationCap}
        title="Learning"
        subtitle="What you meant to read, what you are part-way through, and what actually stuck."
        count={data?.total}
        actions={
          <Link href="/learning/new">
            <Button variant="primary">
              <Plus size={13} /> Add
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, technologies and notes…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(LEARNING_STATUS, 'Any')}
        />
        <FilterSelect
          label="Kind"
          value={values.kind ?? ''}
          onChange={(kind) => set({ kind })}
          options={enumOptions(LEARNING_KINDS, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(item) => `/learning/${item.id}`}
        empty={
          <EmptyState
            icon={GraduationCap}
            title={values.q ? 'Nothing matches' : 'Nothing on the list'}
            description={
              values.q
                ? 'No learning item matches those filters.'
                : 'Courses, books, articles and videos — with the honest progress number, not the aspirational one.'
            }
            action={
              <Link href="/learning/new">
                <Button variant="primary">
                  <Plus size={13} /> Add something to learn
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
