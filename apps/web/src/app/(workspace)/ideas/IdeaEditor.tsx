'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { api } from '@/lib/api';
import { IDEA_STATUS, PRIORITY, optionsOf } from '@/lib/domain';
import type { Idea } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  Select,
  TagInput,
  TextInput,
} from '@/components/patterns/Form';
import { MarkdownEditor } from '@/components/patterns/Markdown';

export function IdeaEditor({
  idea,
  projectId,
  onDone,
  onCancel,
}: {
  idea?: Idea;
  projectId?: string | null;
  onDone?: (idea: Idea) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(idea);

  const [form, setForm] = useState({
    title: idea?.title ?? '',
    description: idea?.description ?? '',
    category: idea?.category ?? '',
    priority: idea?.priority ?? 'MEDIUM',
    status: idea?.status ?? 'IDEA',
    projectId: idea?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(idea?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Idea>(`/ideas/${idea?.id}`, { method: 'PATCH', body })
      : api<Idea>('/ideas', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      description: form.description || undefined,
      category: form.category || undefined,
      priority: form.priority,
      status: form.status,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/ideas/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={Lightbulb} title="Capture an idea" />}

      <FormPanel
        title={editing ? 'Edit idea' : 'Idea'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Capture idea'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/ideas">
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
            placeholder="Ephemeral preview environments per pull request"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(IDEA_STATUS)}
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
          <Field label="Category">
            <TextInput
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Infrastructure"
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Description" wide>
          <MarkdownEditor
            value={form.description}
            onChange={(description) => setForm({ ...form, description })}
            rows={8}
            placeholder="What it is, why it might be worth doing, what it would replace."
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
