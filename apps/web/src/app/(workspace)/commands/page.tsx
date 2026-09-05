'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Terminal, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import { COMMAND_PLATFORMS, DANGER_LEVEL, enumOptions, humanise, optionsOf } from '@/lib/domain';
import type { CommandRecord } from '@/lib/types';
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
import { MonoCell } from '@/components/patterns/DetailShell';
import { DangerCopyButton } from './DangerCopyButton';

export default function CommandsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading, reload } = useList<CommandRecord>('/commands', queryString);
  const categories = useCategories();

  const columns: Column<CommandRecord>[] = [
    {
      key: 'title',
      header: 'Command',
      render: (command) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="flex items-center gap-[6px]">
            {command.dangerLevel === 'DESTRUCTIVE' && (
              <TriangleAlert size={11} className="shrink-0 text-[var(--danger)]" />
            )}
            <span className="truncate text-[12.5px]">{command.title}</span>
          </span>
          <code
            className={cx(
              'mono truncate text-[11px]',
              command.dangerLevel === 'DESTRUCTIVE'
                ? 'text-[var(--danger)]'
                : 'text-[var(--text-faint)]',
            )}
          >
            {command.command}
          </code>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '110px',
      hideBelow: 'lg',
      render: (command) => <MonoCell value={command.category} />,
    },
    {
      key: 'platform',
      header: 'Platform',
      width: '92px',
      hideBelow: 'md',
      render: (command) => <MonoCell value={humanise(command.platform)} />,
    },
    {
      key: 'danger',
      header: 'Danger',
      width: '104px',
      render: (command) => (
        <Badge signal={DANGER_LEVEL[command.dangerLevel]}>{command.dangerLevel}</Badge>
      ),
    },
    {
      key: 'copy',
      header: '',
      width: '84px',
      align: 'right',
      render: (command) => <DangerCopyButton command={command} onCopied={reload} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Terminal}
        title="Commands"
        subtitle="The incantations you never remember, with a warning on the ones that bite."
        count={data?.total}
        actions={
          <Link href="/commands/new">
            <Button variant="primary">
              <Plus size={13} /> New command
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, commands and descriptions…"
        />
        <FilterSelect
          label="Platform"
          value={values.platform ?? ''}
          onChange={(platform) => set({ platform })}
          options={enumOptions(COMMAND_PLATFORMS, 'Any')}
        />
        <FilterSelect
          label="Category"
          value={values.category ?? ''}
          onChange={(category) => set({ category })}
          options={[
            { value: '', label: 'Any' },
            ...categories.map((entry) => ({
              value: entry.category,
              label: `${entry.category} (${entry.count})`,
            })),
          ]}
        />
        <FilterSelect
          label="Danger"
          value={values.dangerLevel ?? ''}
          onChange={(dangerLevel) => set({ dangerLevel })}
          options={optionsOf(DANGER_LEVEL, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(command) => `/commands/${command.id}`}
        empty={
          <EmptyState
            icon={Terminal}
            title={values.q ? 'Nothing matches' : 'No commands saved'}
            description={
              values.q
                ? 'No command matches those filters.'
                : 'Keep the ones you look up every time: the replica set init, the certificate expiry check, the disk-usage incantation.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'grouped by platform and category',
                    'destructive commands confirm before they reach your clipboard',
                    'nothing is ever executed by this application',
                  ]
            }
            action={
              <Link href="/commands/new">
                <Button variant="primary">
                  <Plus size={13} /> Save a command
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

      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        <TriangleAlert size={12} className="mt-[2px] shrink-0" />
        This is a reference, not a shell. Nothing here is ever run by the application — copying a
        destructive command asks first, and what you do in your own terminal is your own business.
      </p>
    </div>
  );
}

function useCategories(): { category: string; count: number }[] {
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  useEffect(() => {
    api<{ category: string; count: number }[]>('/commands/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);
  return categories;
}
