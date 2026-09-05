'use client';

import Link from 'next/link';
import { Plus, ScrollText } from 'lucide-react';
import { ADR_STATUS, adrNumber, humanise, optionsOf } from '@/lib/domain';
import type { Adr } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

export default function AdrsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25', sort: 'number', order: 'desc' });
  const { data, loading } = useList<Adr>('/adrs', queryString);

  const columns: Column<Adr>[] = [
    {
      key: 'number',
      header: 'No.',
      width: '62px',
      render: (adr) => (
        <span className="mono text-[11.5px] text-[var(--accent)]">{adrNumber(adr.number)}</span>
      ),
    },
    {
      key: 'title',
      header: 'Decision',
      render: (adr) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span
            className={
              adr.status === 'SUPERSEDED' || adr.status === 'DEPRECATED'
                ? 'truncate text-[12.5px] text-[var(--text-faint)] line-through'
                : 'truncate text-[12.5px]'
            }
          >
            {adr.title}
          </span>
          <span className="truncate text-[11px] text-[var(--text-faint)]">{adr.decision}</span>
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (adr) => <ProjectCell project={adr.project} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '124px',
      render: (adr) => (
        <StatusIndicator signal={ADR_STATUS[adr.status]} label={humanise(adr.status)} />
      ),
    },
    {
      key: 'decided',
      header: 'Decided',
      width: '84px',
      align: 'right',
      render: (adr) => <TimeCell value={adr.decidedAt ?? adr.createdAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={ScrollText}
        title="Architecture decisions"
        subtitle="Why things are the way they are — and what you already ruled out."
        count={data?.total}
        actions={
          <Link href="/adrs/new">
            <Button variant="primary">
              <Plus size={13} /> New decision
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search context, decisions and consequences…"
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(ADR_STATUS, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(adr) => `/adrs/${adr.id}`}
        empty={
          <EmptyState
            icon={ScrollText}
            title={values.q ? 'Nothing matches' : 'No decisions recorded'}
            description={
              values.q
                ? 'No decision record matches those filters.'
                : 'Record the calls that shaped the architecture, with what you considered and rejected. Numbers are permanent, so “see ADR-004” keeps meaning the same thing.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'context, decision, alternatives, consequences',
                    'proposed through accepted, rejected or superseded',
                    'a chain showing what replaced what',
                  ]
            }
            action={
              <Link href="/adrs/new">
                <Button variant="primary">
                  <Plus size={13} /> Record a decision
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
