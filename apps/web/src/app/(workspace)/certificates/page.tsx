'use client';

import Link from 'next/link';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SslCertificate } from '@/lib/types';
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

export default function CertificatesPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<SslCertificate>('/certificates', queryString);

  const expiringSoon = (data?.items ?? []).filter(
    (certificate) => certificate.state === 'critical' || certificate.state === 'expired',
  ).length;

  const columns: Column<SslCertificate>[] = [
    {
      key: 'commonName',
      header: 'Certificate',
      render: (certificate) => (
        <span className="flex min-w-0 items-center gap-2">
          <ShieldCheck size={12} className="shrink-0 text-[var(--text-faint)]" />
          <span className="mono truncate text-[12.5px]">{certificate.commonName}</span>
        </span>
      ),
    },
    {
      key: 'issuer',
      header: 'Issuer',
      width: '170px',
      hideBelow: 'lg',
      render: (certificate) => <MonoCell value={certificate.issuer} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '130px',
      hideBelow: 'md',
      render: (certificate) => <ProjectCell project={certificate.project} />,
    },
    {
      key: 'renew',
      header: 'Renewal',
      width: '96px',
      hideBelow: 'sm',
      render: (certificate) =>
        certificate.autoRenew ? (
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
      render: (certificate) => <ExpiryIndicator daysLeft={certificate.daysLeft} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={ShieldCheck}
        title="SSL certificates"
        subtitle="What breaks next, at the top."
        count={data?.total}
        actions={
          <Link href="/certificates/new">
            <Button variant="primary">
              <Plus size={13} /> Add certificate
            </Button>
          </Link>
        }
      />

      {expiringSoon > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12.5px]">
          <ShieldCheck size={13} className="shrink-0 text-[var(--danger)]" />
          {expiringSoon} certificate{expiringSoon === 1 ? '' : 's'} expiring within a week, or
          already expired.
        </p>
      )}

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search common names, issuers and notes…"
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
        href={(certificate) => `/certificates/${certificate.id}`}
        empty={
          <EmptyState
            icon={ShieldCheck}
            title={values.q ? 'Nothing matches' : 'No certificates recorded'}
            description={
              values.q
                ? 'No certificate matches those filters.'
                : 'Even with auto-renewal, the renewal hook is the thing that breaks silently. Record the expiry and you find out before your users do.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'issuer, issue and expiry dates',
                    'valid, warning or critical at a glance',
                    'the domain and environment it covers',
                  ]
            }
            action={
              <Link href="/certificates/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a certificate
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

      <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">
        This application never issues or installs certificates. Renew with certbot or your provider,
        then record the new dates here.
      </p>
    </div>
  );
}
