'use client';

import Link from 'next/link';
import { Database, Plus } from 'lucide-react';
import { BACKUP_SIGNAL, DATABASE_TYPES, enumOptions } from '@/lib/domain';
import type { DatabaseInstance } from '@/lib/types';
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
import { MonoCell, ProjectCell } from '@/components/patterns/DetailShell';

export default function DatabasesPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<DatabaseInstance>('/databases', queryString);

  const columns: Column<DatabaseInstance>[] = [
    {
      key: 'name',
      header: 'Database',
      render: (database) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{database.name}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {[database.host, database.databaseName].filter(Boolean).join(' / ') || '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Engine',
      width: '124px',
      render: (database) => (
        <span className="flex items-center gap-2">
          <Badge>{database.type}</Badge>
          {database.version && (
            <span className="mono text-[10.5px] text-[var(--text-faint)]">{database.version}</span>
          )}
        </span>
      ),
    },
    {
      key: 'server',
      header: 'Host',
      width: '140px',
      hideBelow: 'lg',
      render: (database) => <MonoCell value={database.server?.name} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '130px',
      hideBelow: 'md',
      render: (database) => <ProjectCell project={database.project} />,
    },
    {
      key: 'backup',
      header: 'Backup',
      width: '150px',
      render: (database) => {
        const state = BACKUP_SIGNAL[database.backupStatus] ?? BACKUP_SIGNAL.none;
        return <StatusIndicator signal={state.signal} label={state.label} />;
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Database}
        title="Databases"
        subtitle="Where the data lives — and when it was last backed up."
        count={data?.total}
        actions={
          <Link href="/databases/new">
            <Button variant="primary">
              <Plus size={13} /> Add database
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search names, hosts and database names…"
        />
        <FilterSelect
          label="Engine"
          value={values.type ?? ''}
          onChange={(type) => set({ type })}
          options={enumOptions(DATABASE_TYPES, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(database) => `/databases/${database.id}`}
        empty={
          <EmptyState
            icon={Database}
            title={values.q ? 'Nothing matches' : 'No databases recorded'}
            description={
              values.q
                ? 'No database matches those filters.'
                : 'Host, port, database name and which server it sits on — everything except the password, which belongs in the vault.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'engine, version and size',
                    'the server and environment it belongs to',
                    'its credential — as a vault reference, never a password',
                    'backup schedule, and when one last ran',
                  ]
            }
            action={
              <Link href="/databases/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a database
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
