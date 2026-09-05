'use client';

import Link from 'next/link';
import { Notebook, Pin, Plus } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { NOTE_TYPES, enumOptions, humanise } from '@/lib/domain';
import type { NoteRow } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  FilterToggle,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';

export default function NotesPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<NoteRow>('/notes', queryString);
  const filtered = Boolean(values.q || values.type || values.pinned);

  const columns: Column<NoteRow>[] = [
    {
      key: 'title',
      header: 'Note',
      render: (note) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="flex items-center gap-[6px]">
            {note.isPinned && <Pin size={10} className="shrink-0 text-[var(--accent)]" />}
            <span className="truncate text-[12.5px]">{note.title}</span>
          </span>
          {note.preview && (
            <span className="truncate text-[11.5px] text-[var(--text-faint)]">{note.preview}</span>
          )}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      width: '170px',
      hideBelow: 'lg',
      render: (note) => (
        <span className="mono truncate text-[11px] text-[var(--text-faint)]">
          {note.tags.map((tag) => tag.name).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (note) =>
        note.project ? (
          <span className="flex min-w-0 items-center gap-[6px]">
            <span
              aria-hidden
              className="h-[9px] w-[2px] shrink-0 rounded-sm"
              style={{ background: note.project.color ?? 'var(--line-strong)' }}
            />
            <span className="truncate text-[12px] text-[var(--text-muted)]">
              {note.project.name}
            </span>
          </span>
        ) : (
          <span className="text-[11.5px] text-[var(--text-faint)]">Unfiled</span>
        ),
    },
    {
      key: 'type',
      header: 'Type',
      width: '110px',
      hideBelow: 'sm',
      render: (note) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">{humanise(note.type)}</span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '86px',
      align: 'right',
      render: (note) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">{timeAgo(note.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Notebook}
        title="Notes"
        subtitle="Markdown, code blocks and checklists — linked to whatever they are about."
        count={data?.total}
        actions={
          <Link href="/notes/new">
            <Button variant="primary">
              <Plus size={13} /> New note
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles and content…"
        />
        <FilterSelect
          label="Type"
          value={values.type ?? ''}
          onChange={(type) => set({ type })}
          options={enumOptions(NOTE_TYPES, 'Any')}
        />
        <FilterToggle
          label="Pinned"
          icon={Pin}
          active={values.pinned === 'true'}
          onChange={(on) => set({ pinned: on ? 'true' : undefined })}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(note) => `/notes/${note.id}`}
        empty={
          <EmptyState
            icon={Notebook}
            title={filtered ? 'Nothing matches' : 'No notes yet'}
            description={
              filtered
                ? 'No note matches those filters. Clear them to see everything.'
                : 'Notes are where the thinking goes: how something works, what you tried, what you decided.'
            }
            connects={
              filtered
                ? undefined
                : [
                    'markdown with code, tables and checklists',
                    'attached to a project, or left unfiled',
                    'tagged and searchable from anywhere',
                  ]
            }
            action={
              <Link href="/notes/new">
                <Button variant="primary">
                  <Plus size={13} /> Write a note
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
