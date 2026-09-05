'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { LEARNING_KINDS, LEARNING_STATUS, enumOptions, optionsOf } from '@/lib/domain';
import type { LearningItem } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button, ProgressBar } from '@/components/primitives';
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

export function LearningEditor({
  item,
  projectId,
  onDone,
  onCancel,
}: {
  item?: LearningItem;
  projectId?: string | null;
  onDone?: (item: LearningItem) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(item);

  const [form, setForm] = useState({
    title: item?.title ?? '',
    technology: item?.technology ?? '',
    kind: item?.kind ?? 'COURSE',
    url: item?.url ?? '',
    status: item?.status ?? 'WANT_TO_LEARN',
    progress: item?.progress ?? 0,
    notes: item?.notes ?? '',
    projectId: item?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(item?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<LearningItem>(`/learning/${item?.id}`, { method: 'PATCH', body })
      : api<LearningItem>('/learning', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      technology: form.technology || undefined,
      kind: form.kind,
      url: form.url || undefined,
      status: form.status,
      progress: form.progress,
      notes: form.notes || undefined,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/learning/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={GraduationCap} title="Add something to learn" />}

      <FormPanel
        title={editing ? 'Edit' : 'Learning item'}
        description="Progress and status stay in step — 100% means completed, and completing sets 100%."
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/learning">
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
            placeholder="Designing Data-Intensive Applications"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Kind">
            <Select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
              options={enumOptions(LEARNING_KINDS)}
            />
          </Field>
          <Field label="Technology">
            <TextInput
              value={form.technology}
              onChange={(event) => setForm({ ...form, technology: event.target.value })}
              placeholder="Distributed systems"
            />
          </Field>
        </div>

        <Field label="Link">
          <TextInput
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            placeholder="https://…"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(LEARNING_STATUS)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Progress" hint="Be honest — this is only for you.">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={(event) => setForm({ ...form, progress: Number(event.target.value) })}
              aria-label="Progress"
              className="h-[3px] flex-1 accent-[var(--accent)]"
            />
            <span className="w-[110px] shrink-0">
              <ProgressBar value={form.progress} />
            </span>
          </div>
        </Field>

        <Field label="Notes" wide>
          <MarkdownEditor
            value={form.notes}
            onChange={(notes) => setForm({ ...form, notes })}
            rows={6}
            placeholder="What stuck, what to come back to."
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
