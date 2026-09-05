'use client';

import Link from 'next/link';
import { Globe, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Domain } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState, ExpiryIndicator } from '@/components/primitives';
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

export default function DomainsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Domain>('/domains', queryString);

  const columns: Column<Domain>[] = [
    {
      key: 'name',
      header: 'Domain',
      render: (domain) => (
        <span className="flex min-w-0 items-center gap-2">
          <Globe size={12} className="shrink-0 text-[var(--text-faint)]" />
          <span className="mono truncate text-[12.5px]">{domain.name}</span>
          {domain.certificates && domain.certificates.length > 0 && (
            <ShieldCheck size={11} className="shrink-0 text-[var(--success)]" />
          )}
        </span>
      ),
    },
    {
      key: 'registrar',
      header: 'Registrar',
      width: '130px',
      hideBelow: 'lg',
      render: (domain) => <MonoCell value={domain.registrar} />,
    },
    {
      key: 'dns',
      header: 'DNS',
      width: '120px',
      hideBelow: 'xl',
      render: (domain) => <MonoCell value={domain.dnsProvider} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '130px',
      hideBelow: 'md',
      render: (domain) => <ProjectCell project={domain.project} />,
    },
    {
      key: 'renew',
      header: 'Renewal',
      width: '96px',
      hideBelow: 'sm',
      render: (domain) =>
        domain.autoRenew ? (
          <span className="flex items-center gap-[5px] text-[11.5px] text-[var(--success)]">
            <RefreshCw size={10} /> Auto
          </span>
        ) : (
          <span className="text-[11.5px] text-[var(--warning)]">Manual</span>
        ),
    },
    {
      key: 'expiry',
      header: 'Expiry',
      width: '160px',
      render: (domain) => <ExpiryIndicator daysLeft={domain.daysLeft} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Globe}
        title="Domains"
        subtitle="Soonest expiry first, because that is the question this page answers."
        count={data?.total}
        actions={
          <Link href="/domains/new">
            <Button variant="primary">
              <Plus size={13} /> Add domain
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search domains, registrars and notes…"
        />
        <FilterSelect
          label="Expiring"
          value={values.expiringWithin ?? ''}
          onChange={(expiringWithin) => set({ expiringWithin })}
          options={[
            { value: '', label: 'Any time' },
            { value: '7', label: 'Within 7 days' },
            { value: '30', label: 'Within 30 days' },
            { value: '90', label: 'Within 90 days' },
          ]}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(domain) => `/domains/${domain.id}`}
        empty={
          <EmptyState
            icon={Globe}
            title={values.q ? 'Nothing matches' : 'No domains recorded'}
            description={
              values.q
                ? 'No domain matches those filters.'
                : 'A domain expiring unnoticed takes a service down for a whole weekend. Record the expiry once and the dashboard will warn you.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'registrar, DNS provider and expiry',
                    'auto-renewal state',
                    'the certificates issued for it',
                  ]
            }
            action={
              <Link href="/domains/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a domain
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
