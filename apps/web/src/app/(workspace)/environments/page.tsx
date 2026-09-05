'use client';

import Link from 'next/link';
import { Cloud, Plus } from 'lucide-react';
import { ENVIRONMENT_TYPES, enumOptions } from '@/lib/domain';
import type { Environment } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { MonoCell, ProjectCell } from '@/components/patterns/DetailShell';

export default function EnvironmentsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Environment>('/environments', queryString);

  const columns: Column<Environment>[] = [
    {
      key: 'name',
      header: 'Environment',
      render: (environment) => (
        <span className="flex min-w-0 items-center gap-2">
          <Badge>{environment.type}</Badge>
          <span className="truncate text-[12.5px]">{environment.name}</span>
        </span>
      ),
    },
    {
      key: 'baseUrl',
      header: 'Base URL',
      width: '230px',
      hideBelow: 'lg',
      render: (environment) => <MonoCell value={environment.baseUrl} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '150px',
      hideBelow: 'md',
      render: (environment) => <ProjectCell project={environment.project} />,
    },
    {
      key: 'variables',
      header: 'Variables',
      width: '76px',
      align: 'right',
      hideBelow: 'sm',
      render: (environment) => (
        <span className="num text-[11px] text-[var(--text-faint)]">
          {environment.variables?.length ?? 0}
        </span>
      ),
    },
    {
      key: 'contains',
      header: 'Contains',
      width: '150px',
      align: 'right',
      render: (environment) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">{summarise(environment)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Cloud}
        title="Environments"
        subtitle="Development through production, and the configuration each one needs."
        count={data?.total}
        actions={
          <Link href="/environments/new">
            <Button variant="primary">
              <Plus size={13} /> New environment
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search names, URLs and notes…"
        />
        <FilterSelect
          label="Type"
          value={values.type ?? ''}
          onChange={(type) => set({ type })}
          options={enumOptions(ENVIRONMENT_TYPES, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(environment) => `/environments/${environment.id}`}
        empty={
          <EmptyState
            icon={Cloud}
            title={values.q ? 'Nothing matches' : 'No environments defined'}
            description={
              values.q
                ? 'No environment matches those filters.'
                : 'An environment is what ties a server, a database and a domain together — and where the configuration for that combination lives.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'servers, databases and domains',
                    'environment variables, as literals or vault references',
                    'the deployments that went to it',
                  ]
            }
            action={
              <Link href="/environments/new">
                <Button variant="primary">
                  <Plus size={13} /> Define an environment
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

function summarise(environment: Environment): string {
  const counts = environment.counts;
  if (!counts) return '—';
  const parts = [
    counts.servers ? `${counts.servers} server${counts.servers === 1 ? '' : 's'}` : '',
    counts.databases ? `${counts.databases} db` : '',
    counts.domains ? `${counts.domains} domain${counts.domains === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'empty';
}
