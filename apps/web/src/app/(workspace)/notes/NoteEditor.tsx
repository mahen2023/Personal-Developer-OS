'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Notebook, Pin } from 'lucide-react';
import { api } from '@/lib/api';
import { NOTE_TYPES, enumOptions } from '@/lib/domain';
import type { Note } from '@/lib/types';
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
  Toggle,
} from '@/components/patterns/Form';
import { MarkdownEditor } from '@/components/patterns/Markdown';

/**
 * One editor for both creating and updating. The two differ only in the verb
 * and the endpoint, and keeping them together means a field added to the form
 * cannot be forgotten on one of the paths.
 */
export function NoteEditor({
  note,
  projectId,
  onDone,
  onCancel,
}: {
  note?: Note;
  projectId?: string | null;
  onDone?: (note: Note) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(note);

  const [form, setForm] = useState({
    title: note?.title ?? '',
    content: note?.content ?? '',
    type: note?.type ?? 'GENERAL',
    projectId: note?.projectId ?? projectId ?? null,
    isPinned: note?.isPinned ?? false,
  });
  const [tags, setTags] = useState<string[]>(note?.tags.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Note>(`/notes/${note?.id}`, { method: 'PATCH', body })
      : api<Note>('/notes', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({ ...form, tags });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/notes/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={Notebook}
          title="New note"
          subtitle="Markdown, with fenced code, tables and task lists."
        />
      )}

      <FormPanel
        title={editing ? 'Edit note' : 'Note'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Create note'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/notes">
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
            placeholder="MongoDB transaction notes"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={enumOptions(NOTE_TYPES)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <Field label="Content" wide>
          <MarkdownEditor
            value={form.content}
            onChange={(content) => setForm({ ...form, content })}
          />
        </Field>

        <Toggle
          checked={form.isPinned}
          onChange={(isPinned) => setForm({ ...form, isPinned })}
          label="Pin to the top of the list"
        />
        {form.isPinned && (
          <p className="flex items-center gap-[5px] text-[11.5px] text-[var(--text-faint)]">
            <Pin size={11} /> Pinned notes float above the chosen sort order.
          </p>
        )}
      </FormPanel>
    </div>
  );
}
