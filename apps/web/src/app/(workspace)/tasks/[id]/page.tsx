'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Trash2, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { PRIORITY, TASK_STATUS, humanise } from '@/lib/domain';
import type { Task } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
import { TaskEditor } from '../TaskEditor';

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { data: task, loading, set } = useRecord<Task>(`/tasks/${id}`);

  const setStatus = useAction((status: string) =>
    api<Task>(`/tasks/${id}`, { method: 'PATCH', body: { status } }),
  );
  const remove = useAction(() => api(`/tasks/${id}`, { method: 'DELETE' }));

  useContextPanel('Task', task ? <TaskContext task={task} /> : null, [task?.id, task?.updatedAt]);

  if (loading && !task) return <LoadingLine message="Loading task…" />;
  if (!task) return null;

  if (editing) {
    return (
      <TaskEditor
        task={task}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  const done = task.status === 'DONE';

  return (
    <article className="mx-auto max-w-[820px] px-6 pb-16 pt-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-[-0.015em]">{task.title}</h1>
          <div className="mono mt-[6px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
            <StatusIndicator signal={TASK_STATUS[task.status]} label={humanise(task.status)} />
            <Badge signal={PRIORITY[task.priority]}>{task.priority}</Badge>
            {task.project && (
              <Link href={`/projects/${task.project.slug}`} className="hover:text-[var(--accent)]">
                {task.project.name}
              </Link>
            )}
            {task.dueDate && <span>due {timeAgo(task.dueDate)}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={done ? 'default' : 'primary'}
            disabled={setStatus.busy}
            onClick={async () => {
              const saved = await setStatus.run(done ? 'TODO' : 'DONE');
              if (saved) set(saved);
            }}
          >
            {done ? <Undo2 size={13} /> : <Check size={13} />}
            {done ? 'Reopen' : 'Mark done'}
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </Button>
          <Button
            variant="danger"
            // Icon-only, so it needs a name of its own: without one the control
            // is unreachable by screen reader and unnameable by anything else.
            aria-label="Delete"
            disabled={remove.busy}
            onClick={async () => {
              if (!window.confirm(`Delete "${task.title}"?`)) return;
              await remove.run();
              router.push('/tasks');
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </header>

      {task.description ? (
        <Markdown>{task.description}</Markdown>
      ) : (
        <p className="text-[12.5px] italic text-[var(--text-faint)]">No description.</p>
      )}
    </article>
  );
}

function TaskContext({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="label mb-[6px]">Details</div>
        <dl className="flex flex-col gap-[3px] text-[12px]">
          <Row label="Status" value={humanise(task.status)} />
          <Row label="Priority" value={humanise(task.priority)} />
          <Row label="Due" value={task.dueDate ? timeAgo(task.dueDate) : 'Not scheduled'} />
          <Row label="Assignee" value={task.assignee ?? '—'} />
          {task.completedAt && <Row label="Completed" value={timeAgo(task.completedAt)} />}
        </dl>
      </div>

      {task.meeting && (
        <>
          <div className="h-px bg-[var(--line)]" />
          <div>
            <div className="label mb-[6px]">From meeting</div>
            <Link
              href={`/meetings/${task.meeting.id}`}
              className="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              {task.meeting.title}
            </Link>
          </div>
        </>
      )}

      {task.tags && task.tags.length > 0 && (
        <>
          <div className="h-px bg-[var(--line)]" />
          <div>
            <div className="label mb-[6px]">Tags</div>
            <div className="flex flex-wrap gap-[4px]">
              {task.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tasks?tags=${tag.slug}`}
                  className="mono rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[11px] text-[var(--text-muted)] hover:border-[var(--accent-line)]"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="h-px bg-[var(--line)]" />
      <div className="mono flex flex-col gap-[3px] text-[11px] text-[var(--text-faint)]">
        <span>created {timeAgo(task.createdAt)}</span>
        <span>updated {timeAgo(task.updatedAt)}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-faint)]">{label}</dt>
      <dd className="truncate text-[var(--text-muted)]">{value}</dd>
    </div>
  );
}
