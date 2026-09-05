'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Columns3, ListChecks, Plus, Rows3, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { PRIORITY, TASK_STATUS, humanise, optionsOf } from '@/lib/domain';
import type { Board, Task, TaskTimeline } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Badge, Button, EmptyState, LoadingLine, StatusIndicator } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  FilterToggle,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
  ViewSwitch,
} from '@/components/patterns/PageShell';

type View = 'list' | 'board' | 'timeline';

export default function TasksPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const view = (values.view as View) ?? 'list';

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        subtitle="Three views over the same work — kanban is one of them, not the only one."
        views={
          <ViewSwitch
            value={view}
            onChange={(next) => set({ view: next === 'list' ? undefined : next })}
            options={[
              { value: 'list', label: 'List', icon: Rows3 },
              { value: 'board', label: 'Board', icon: Columns3 },
              { value: 'timeline', label: 'Timeline', icon: CalendarClock },
            ]}
          />
        }
        actions={
          <Link href="/tasks/new">
            <Button variant="primary">
              <Plus size={13} /> New task
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Filter by title, description or assignee…"
        />
        {view === 'list' && (
          <FilterSelect
            label="Status"
            value={values.status ?? ''}
            onChange={(status) => set({ status })}
            options={optionsOf(TASK_STATUS, 'Any')}
          />
        )}
        <FilterSelect
          label="Priority"
          value={values.priority ?? ''}
          onChange={(priority) => set({ priority })}
          options={optionsOf(PRIORITY, 'Any')}
        />
        <FilterToggle
          label="Overdue"
          icon={TriangleAlert}
          active={values.overdue === 'true'}
          onChange={(on) => set({ overdue: on ? 'true' : undefined })}
        />
      </Toolbar>

      {view === 'list' && <ListView queryString={queryString} set={set} values={values} />}
      {view === 'board' && <BoardView queryString={queryString} />}
      {view === 'timeline' && <TimelineView queryString={queryString} />}
    </div>
  );
}

/* ── list ─────────────────────────────────────────────────────────────────── */

function ListView({
  queryString,
  set,
  values,
}: {
  queryString: string;
  set: (patch: Record<string, string | undefined>) => void;
  values: Record<string, string>;
}) {
  const { data, loading } = useList<Task>('/tasks', queryString);

  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Task',
      render: (task) => (
        <span
          className={cx(
            'truncate text-[12.5px]',
            task.status === 'DONE' && 'text-[var(--text-faint)] line-through',
          )}
        >
          {task.title}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (task) =>
        task.project ? (
          <span className="truncate text-[12px] text-[var(--text-muted)]">{task.project.name}</span>
        ) : (
          <span className="text-[11.5px] text-[var(--text-faint)]">Unfiled</span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '78px',
      hideBelow: 'sm',
      render: (task) => <Badge signal={PRIORITY[task.priority]}>{task.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '118px',
      render: (task) => (
        <StatusIndicator signal={TASK_STATUS[task.status]} label={humanise(task.status)} />
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: '92px',
      align: 'right',
      render: (task) => <DueDate task={task} />,
    },
  ];

  return (
    <>
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(task) => `/tasks/${task.id}`}
        empty={
          <EmptyState
            icon={ListChecks}
            title={values.q || values.status ? 'Nothing matches' : 'No tasks yet'}
            description={
              values.q || values.status
                ? 'No task matches those filters.'
                : 'Track what needs doing, on its own or against a project. Overdue work surfaces on the dashboard.'
            }
            action={
              <Link href="/tasks/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a task
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
    </>
  );
}

/* ── board ────────────────────────────────────────────────────────────────── */

function BoardView({ queryString }: { queryString: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const load = () => {
    api<Board>(`/tasks/board${queryString ? `?${queryString}` : ''}`)
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [queryString]);

  async function drop(status: string, position: number) {
    if (!dragging) return;
    const id = dragging;
    setDragging(null);
    setOver(null);
    await api(`/tasks/${id}/move`, { method: 'PATCH', body: { status, position } }).catch(
      () => undefined,
    );
    load();
  }

  if (loading && !board) return <LoadingLine message="Loading board…" />;
  if (!board) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {board.columns.map((column) => (
        <section
          key={column.status}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(column.status);
          }}
          onDragLeave={() => setOver((current) => (current === column.status ? null : current))}
          onDrop={() => void drop(column.status, column.items.length)}
          className={cx(
            'flex min-h-[160px] flex-col overflow-hidden rounded border bg-[var(--surface-raised)] transition-colors duration-[var(--fast)]',
            over === column.status ? 'border-[var(--accent-line)]' : 'border-line',
          )}
        >
          <div className="flex h-8 items-center gap-2 border-b border-line px-3">
            <StatusIndicator signal={TASK_STATUS[column.status]} />
            <span className="label flex-1">{humanise(column.status)}</span>
            <span className="num text-[11px] text-[var(--text-faint)]">{column.total}</span>
          </div>

          <div className="flex flex-1 flex-col gap-[1px] p-[6px]">
            {column.items.length === 0 && (
              <p className="px-2 py-4 text-center text-[11.5px] text-[var(--text-faint)]">
                Drop a task here
              </p>
            )}
            {column.items.map((task, index) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDragging(task.id)}
                onDragEnd={() => setDragging(null)}
                onDrop={(event) => {
                  event.stopPropagation();
                  void drop(column.status, index);
                }}
                className={cx(
                  'cursor-grab rounded border border-line bg-[var(--surface-base)] p-[8px] transition-opacity duration-[var(--fast)] hover:border-[var(--line-strong)] active:cursor-grabbing',
                  dragging === task.id && 'opacity-40',
                )}
              >
                <Link href={`/tasks/${task.id}`} className="block">
                  <p className="mb-[5px] line-clamp-3 text-[12.5px] leading-snug">{task.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge signal={PRIORITY[task.priority]}>{task.priority}</Badge>
                    {task.project && (
                      <span className="mono truncate text-[10.5px] text-[var(--text-faint)]">
                        {task.project.name}
                      </span>
                    )}
                    <span className="ml-auto shrink-0">
                      <DueDate task={task} compact />
                    </span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── timeline ─────────────────────────────────────────────────────────────── */

function TimelineView({ queryString }: { queryString: string }) {
  const [timeline, setTimeline] = useState<TaskTimeline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<TaskTimeline>(`/tasks/timeline${queryString ? `?${queryString}` : ''}`)
      .then(setTimeline)
      .catch(() => setTimeline(null))
      .finally(() => setLoading(false));
  }, [queryString]);

  if (loading && !timeline) return <LoadingLine message="Building the timeline…" />;
  if (!timeline || timeline.days.length === 0) {
    return (
      <div className="rounded border border-line bg-[var(--surface-raised)]">
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Tasks with a due date appear here, ordered by when they land. Tasks without one stay in the list and board views."
        />
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="stagger overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      {timeline.days.map((day) => {
        const overdue = day.date < today;
        return (
          <div key={day.date} className="flex gap-4 border-b border-line px-4 py-3 last:border-b-0">
            <div className="w-[92px] shrink-0">
              <div
                className={cx(
                  'mono text-[11.5px]',
                  overdue ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]',
                )}
              >
                {new Date(day.date).toLocaleDateString([], {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
              <div className="label mt-[2px]">
                {overdue ? 'overdue' : day.date === today ? 'today' : timeAgo(day.date)}
              </div>
            </div>

            <ul className="flex min-w-0 flex-1 flex-col gap-[2px]">
              {day.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-3 rounded px-2 py-[4px] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)]"
                  >
                    <StatusIndicator signal={TASK_STATUS[task.status]} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{task.title}</span>
                    <Badge signal={PRIORITY[task.priority]}>{task.priority}</Badge>
                    {task.project && (
                      <span className="mono hidden w-[120px] shrink-0 truncate text-right text-[11px] text-[var(--text-faint)] md:inline">
                        {task.project.name}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ── shared ───────────────────────────────────────────────────────────────── */

function DueDate({ task, compact }: { task: Task; compact?: boolean }) {
  if (!task.dueDate) {
    return <span className="mono text-[11px] text-[var(--text-faint)]">{compact ? '' : '—'}</span>;
  }
  const overdue = new Date(task.dueDate) < new Date() && task.status !== 'DONE';
  return (
    <span
      className={cx(
        'mono text-[11px]',
        overdue ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]',
      )}
    >
      {timeAgo(task.dueDate)}
    </span>
  );
}
