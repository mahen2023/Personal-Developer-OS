'use client';

import Link from 'next/link';
import { CalendarClock, ListChecks, Plus, Users } from 'lucide-react';
import type { Meeting } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
import {
  type Column,
  DataTable,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

type MeetingRow = Meeting & { actionItemCount?: number };

export default function MeetingsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<MeetingRow>('/meetings', queryString);

  const columns: Column<MeetingRow>[] = [
    {
      key: 'title',
      header: 'Meeting',
      render: (meeting) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{meeting.title}</span>
          {meeting.decisions && (
            <span className="truncate text-[11px] text-[var(--text-faint)]">
              {meeting.decisions}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'participants',
      header: 'Participants',
      width: '170px',
      hideBelow: 'lg',
      render: (meeting) => (
        <span className="mono flex items-center gap-[5px] truncate text-[11px] text-[var(--text-faint)]">
          <Users size={10} className="shrink-0" />
          {meeting.participants.join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (meeting) => <ProjectCell project={meeting.project} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '76px',
      align: 'right',
      hideBelow: 'sm',
      render: (meeting) =>
        meeting.actionItemCount ? (
          <span className="mono flex items-center justify-end gap-[5px] text-[11px] text-[var(--text-muted)]">
            <ListChecks size={10} />
            {meeting.actionItemCount}
          </span>
        ) : (
          <span className="mono text-[11px] text-[var(--text-faint)]">—</span>
        ),
    },
    {
      key: 'date',
      header: 'Date',
      width: '84px',
      align: 'right',
      render: (meeting) => <TimeCell value={meeting.meetingDate} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={CalendarClock}
        title="Meetings"
        subtitle="What was discussed, what was decided, and what someone now has to do."
        count={data?.total}
        actions={
          <Link href="/meetings/new">
            <Button variant="primary">
              <Plus size={13} /> New meeting
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search titles, discussion and decisions…"
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(meeting) => `/meetings/${meeting.id}`}
        empty={
          <EmptyState
            icon={CalendarClock}
            title={values.q ? 'Nothing matches' : 'No meetings recorded'}
            description={
              values.q
                ? 'No meeting matches that search.'
                : 'Write up what was decided while it is still fresh. Action items become real tasks, not a bullet list nobody revisits.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'participants, discussion and decisions',
                    'action items promoted straight into tasks',
                    'attached to the project it concerned',
                  ]
            }
            action={
              <Link href="/meetings/new">
                <Button variant="primary">
                  <Plus size={13} /> Record a meeting
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
