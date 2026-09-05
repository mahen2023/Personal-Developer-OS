'use client';

import Link from 'next/link';
import {
  ChevronsLeftRight,
  KeyRound,
  Lock,
  Plus,
  Server,
  Sparkles,
  SquareTerminal,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { VAULT_ITEM_TYPES, enumOptions, humanise } from '@/lib/domain';
import type { ProjectRef } from '@/lib/types';
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
import { VaultStatusBar } from './VaultStatusBar';

/**
 * Everything the list knows about an item.
 *
 * There is no `cipher` here, and no masked placeholder either: the API does
 * not return the secret on this route, so there is nothing to hide.
 */
export interface VaultRow {
  id: string;
  name: string;
  type: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  rotateEveryD: number | null;
  lastRotatedAt: string | null;
  lastViewedAt: string | null;
  needsRotation: boolean;
  projectId: string | null;
  project: ProjectRef | null;
  createdAt: string;
  updatedAt: string;
}

export const TYPE_ICON: Record<string, LucideIcon> = {
  PASSWORD: KeyRound,
  API_KEY: Sparkles,
  SSH_KEY: SquareTerminal,
  TOTP: ChevronsLeftRight,
  TOKEN: Sparkles,
  CREDENTIAL: Server,
  OTHER: Lock,
};

export function VaultList({
  fixedType,
  title,
  subtitle,
}: {
  fixedType?: string;
  title?: string;
  subtitle?: string;
}) {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const query = fixedType
    ? `${queryString}${queryString ? '&' : ''}type=${fixedType}`
    : queryString;
  const { data, loading } = useList<VaultRow>('/vault/items', query);

  const columns: Column<VaultRow>[] = [
    {
      key: 'name',
      header: 'Item',
      render: (item) => {
        const Icon = TYPE_ICON[item.type] ?? Lock;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <Icon size={12} className="shrink-0 text-[var(--security)]" />
            <span className="truncate text-[12.5px]">{item.name}</span>
            {item.needsRotation && (
              <TriangleAlert size={11} className="shrink-0 text-[var(--warning)]" />
            )}
          </span>
        );
      },
    },
    {
      key: 'username',
      header: 'Username',
      width: '160px',
      hideBelow: 'lg',
      render: (item) => <MonoCell value={item.username} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (item) => <ProjectCell project={item.project} />,
    },
    {
      key: 'type',
      header: 'Type',
      width: '118px',
      hideBelow: 'sm',
      render: (item) => <Badge signal="security">{item.type}</Badge>,
    },
    {
      key: 'secret',
      header: 'Secret',
      width: '96px',
      render: () => <span className="mono text-[11px] text-[var(--text-faint)]">not loaded</span>,
    },
    {
      key: 'rotated',
      header: 'Rotated',
      width: '84px',
      align: 'right',
      render: (item) => (
        <span
          className="mono text-[11px]"
          style={{ color: item.needsRotation ? 'var(--warning)' : 'var(--text-faint)' }}
        >
          {item.lastRotatedAt ? timeAgo(item.lastRotatedAt) : '—'}
        </span>
      ),
    },
  ];

  const needingRotation = (data?.items ?? []).filter((item) => item.needsRotation).length;

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Lock}
        title={title ?? 'Vault'}
        subtitle={subtitle ?? 'Encrypted here, in this browser, before anything is sent.'}
        count={data?.total}
        actions={
          <Link href={`/vault/new${fixedType ? `?type=${fixedType}` : ''}`}>
            <Button variant="primary">
              <Plus size={13} /> Add secret
            </Button>
          </Link>
        }
      />

      <VaultStatusBar />

      {needingRotation > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)] px-3 py-2 text-[12.5px]">
          <TriangleAlert size={13} className="shrink-0 text-[var(--warning)]" />
          {needingRotation} secret{needingRotation === 1 ? '' : 's'} past the rotation age you set.
        </p>
      )}

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search names, usernames and URLs…"
        />
        {!fixedType && (
          <FilterSelect
            label="Type"
            value={values.type ?? ''}
            onChange={(type) => set({ type })}
            options={enumOptions(VAULT_ITEM_TYPES, 'Any')}
          />
        )}
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(item) => `/vault/${item.id}`}
        empty={
          <EmptyState
            icon={Lock}
            title={values.q ? 'Nothing matches' : 'The vault is empty'}
            description={
              values.q
                ? 'No item matches that search. Names and usernames are searchable; secrets are not.'
                : `Passwords, API keys, SSH keys and TOTP secrets${
                    fixedType ? ` — ${humanise(fixedType).toLowerCase()} here` : ''
                  }. Each one is encrypted in this browser before it is sent.`
            }
            connects={
              values.q
                ? undefined
                : [
                    'encrypted with a key derived from your master password',
                    'wrapped again on the server with a key held outside the database',
                    'revealed one at a time, and audited when they are',
                  ]
            }
            action={
              <Link href={`/vault/new${fixedType ? `?type=${fixedType}` : ''}`}>
                <Button variant="primary">
                  <Plus size={13} /> Add a secret
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
