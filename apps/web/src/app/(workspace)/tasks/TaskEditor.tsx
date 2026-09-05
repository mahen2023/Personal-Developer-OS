'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import { PRIORITY, TASK_STATUS, optionsOf } from '@/lib/domain';
import type { Task } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  DateInput,
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  Select,
  TagInput,
  TextArea,
  TextInput,
} from '@/components/patterns/Form';

export function TaskEditor({
  task,
  projectId,
  onDone,
  onCancel,
}: {
  task?: Task;
  projectId?: string | null;
  onDone?: (task: Task) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(task);

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'TODO',
    priority: task?.priority ?? 'MEDIUM',
    // A date input wants YYYY-MM-DD; the API speaks ISO.
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    assignee: task?.assignee ?? '',
    projectId: task?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(task?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Task>(`/tasks/${task?.id}`, { method: 'PATCH', body })
      : api<Task>('/tasks', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      description: form.description || undefined,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`).toISOString() : null,
      assignee: form.assignee || undefined,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/tasks/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={ListChecks} title="New task" />}

      <FormPanel
        title={editing ? 'Edit task' : 'Task'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Create task'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/tasks">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="Title">
          <TextInput
            autoFocus
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Renew the production certificate"
          />
        </Field>

        <Field label="Description">
          <TextArea
            rows={4}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(TASK_STATUS)}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
              options={optionsOf(PRIORITY)}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Due date">
            <DateInput
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </Field>
          <Field label="Assignee" hint="Usually you.">
            <TextInput
              value={form.assignee}
              onChange={(event) => setForm({ ...form, assignee: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Project">
          <ProjectSelect
            value={form.projectId}
            onChange={(value) => setForm({ ...form, projectId: value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
