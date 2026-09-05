'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Braces, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Snippet } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
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

export default function SnippetsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Snippet>('/snippets', queryString);
  const languages = useLanguages();

  const columns: Column<Snippet>[] = [
    {
      key: 'title',
      header: 'Snippet',
      render: (snippet) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{snippet.title}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {firstLine(snippet.code)}
          </span>
        </span>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      width: '110px',
      render: (snippet) => (
        <span className="mono rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[10.5px] text-[var(--text-muted)]">
          {snippet.language}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (snippet) => <ProjectCell project={snippet.project} />,
    },
    {
      key: 'used',
      header: 'Copied',
      width: '62px',
      align: 'right',
      hideBelow: 'sm',
      render: (snippet) => (
        <span className="num text-[11px] text-[var(--text-faint)]">{snippet.useCount}×</span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (snippet) => <TimeCell value={snippet.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Braces}
        title="Code snippets"
        subtitle="The small pieces you keep rewriting, kept once."
        count={data?.total}
        actions={
          <Link href="/snippets/new">
            <Button variant="primary">
              <Plus size={13} /> New snippet
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, code and descriptions…"
        />
        <FilterSelect
          label="Language"
          value={values.language ?? ''}
          onChange={(language) => set({ language })}
          options={[
            { value: '', label: 'Any' },
            ...languages.map((entry) => ({
              value: entry.language,
              label: `${entry.language} (${entry.count})`,
            })),
          ]}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(snippet) => `/snippets/${snippet.id}`}
        empty={
          <EmptyState
            icon={Braces}
            title={values.q || values.language ? 'Nothing matches' : 'No snippets yet'}
            description={
              values.q || values.language
                ? 'No snippet matches those filters.'
                : 'Save the fragments you look up every few months — the transaction wrapper, the retry loop, the awk one-liner.'
            }
            connects={
              values.q || values.language
                ? undefined
                : [
                    'syntax highlighted by language',
                    'searchable by what is in the code',
                    'one click to copy',
                  ]
            }
            action={
              <Link href="/snippets/new">
                <Button variant="primary">
                  <Plus size={13} /> Save a snippet
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

/** The languages actually in use, so the filter needs no maintained list. */
function useLanguages(): { language: string; count: number }[] {
  const [languages, setLanguages] = useState<{ language: string; count: number }[]>([]);
  useEffect(() => {
    api<{ language: string; count: number }[]>('/snippets/languages')
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, []);
  return languages;
}

function firstLine(code: string): string {
  const line = code.split('\n').find((entry) => entry.trim().length > 0) ?? '';
  return line.trim().slice(0, 90);
}
