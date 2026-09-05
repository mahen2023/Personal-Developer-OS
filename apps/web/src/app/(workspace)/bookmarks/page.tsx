'use client';

import Link from 'next/link';
import { BookMarked, ExternalLink, Plus } from 'lucide-react';
import { BOOKMARK_CATEGORIES, enumOptions, humanise } from '@/lib/domain';
import type { Bookmark } from '@/lib/types';
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
import { MonoCell, ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

export default function BookmarksPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Bookmark>('/bookmarks', queryString);

  const columns: Column<Bookmark>[] = [
    {
      key: 'title',
      header: 'Bookmark',
      render: (bookmark) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{bookmark.title}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {hostOf(bookmark.url)}
          </span>
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Note',
      width: '220px',
      hideBelow: 'xl',
      render: (bookmark) => <MonoCell value={bookmark.description} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (bookmark) => <ProjectCell project={bookmark.project} />,
    },
    {
      key: 'category',
      header: 'Category',
      width: '124px',
      hideBelow: 'sm',
      render: (bookmark) => <MonoCell value={humanise(bookmark.category)} />,
    },
    {
      key: 'added',
      header: 'Added',
      width: '80px',
      align: 'right',
      render: (bookmark) => <TimeCell value={bookmark.createdAt} />,
    },
    {
      key: 'open',
      header: '',
      width: '28px',
      align: 'right',
      render: (bookmark) => (
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          title="Open in a new tab"
          className="text-[var(--text-faint)] hover:text-[var(--accent)]"
        >
          <ExternalLink size={12} />
        </a>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={BookMarked}
        title="Bookmarks"
        subtitle="The references you keep re-finding, kept where the rest of your work is."
        count={data?.total}
        actions={
          <Link href="/bookmarks/new">
            <Button variant="primary">
              <Plus size={13} /> Add bookmark
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, URLs and notes…"
        />
        <FilterSelect
          label="Category"
          value={values.category ?? ''}
          onChange={(category) => set({ category })}
          options={enumOptions(BOOKMARK_CATEGORIES, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(bookmark) => `/bookmarks/${bookmark.id}`}
        empty={
          <EmptyState
            icon={BookMarked}
            title={values.q ? 'Nothing matches' : 'No bookmarks yet'}
            description={
              values.q
                ? 'No bookmark matches those filters.'
                : 'The doc page you look up every month, the cheat sheet you can never name. Categorised automatically from the URL.'
            }
            action={
              <Link href="/bookmarks/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a bookmark
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

function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}
