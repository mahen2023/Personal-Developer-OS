'use client';

import Link from 'next/link';
import { Cpu, HardDrive, MemoryStick, Plus, Server as ServerIcon } from 'lucide-react';
import { SERVER_PROVIDERS, SERVER_STATUS, enumOptions, humanise, optionsOf } from '@/lib/domain';
import type { Server } from '@/lib/types';
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

export default function ServersPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Server>('/servers', queryString);

  const columns: Column<Server>[] = [
    {
      key: 'name',
      header: 'Server',
      render: (server) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{server.name}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {[server.hostname, server.ipAddress].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'specs',
      header: 'Specs',
      width: '170px',
      hideBelow: 'lg',
      render: (server) => <Specs server={server} />,
    },
    {
      key: 'services',
      header: 'Services',
      width: '160px',
      hideBelow: 'xl',
      render: (server) => <MonoCell value={server.services.join(' · ')} />,
    },
    {
      key: 'environment',
      header: 'Environment',
      width: '120px',
      hideBelow: 'md',
      render: (server) =>
        server.environment ? <Badge>{server.environment.type}</Badge> : <MonoCell value={null} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '130px',
      hideBelow: 'md',
      render: (server) => <ProjectCell project={server.project} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '116px',
      render: (server) => (
        <StatusIndicator
          signal={SERVER_STATUS[server.status]}
          label={humanise(server.status)}
          pulse={server.status === 'ONLINE'}
        />
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={ServerIcon}
        title="Servers"
        subtitle="What is running where, and how to reach it."
        count={data?.total}
        actions={
          <Link href="/servers/new">
            <Button variant="primary">
              <Plus size={13} /> Add server
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search names, hostnames, IPs and notes…"
        />
        <FilterSelect
          label="Provider"
          value={values.provider ?? ''}
          onChange={(provider) => set({ provider })}
          options={enumOptions(SERVER_PROVIDERS, 'Any')}
        />
        <FilterSelect
          label="Status"
          value={values.status ?? ''}
          onChange={(status) => set({ status })}
          options={optionsOf(SERVER_STATUS, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(server) => `/servers/${server.id}`}
        empty={
          <EmptyState
            icon={ServerIcon}
            title={values.q ? 'Nothing matches' : 'No servers recorded'}
            description={
              values.q
                ? 'No server matches those filters.'
                : 'The machine you SSH into twice a year is exactly the one whose details you will not remember. Record it once.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'provider, region, IP and hostname',
                    'CPU, memory and disk',
                    'the services on it, and the databases it hosts',
                    'its SSH key — as a vault reference, never a key',
                  ]
            }
            action={
              <Link href="/servers/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a server
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

/** Compact spec read-out — the numbers you actually compare between hosts. */
function Specs({ server }: { server: Server }) {
  if (!server.cpuCores && !server.ramGb && !server.diskGb) {
    return <MonoCell value={null} />;
  }
  return (
    <span className="mono flex items-center gap-[10px] text-[11px] text-[var(--text-faint)]">
      {server.cpuCores && (
        <span className="flex items-center gap-[3px]">
          <Cpu size={10} /> {server.cpuCores}
        </span>
      )}
      {server.ramGb && (
        <span className="flex items-center gap-[3px]">
          <MemoryStick size={10} /> {server.ramGb}G
        </span>
      )}
      {server.diskGb && (
        <span className="flex items-center gap-[3px]">
          <HardDrive size={10} /> {server.diskGb}G
        </span>
      )}
    </span>
  );
}
