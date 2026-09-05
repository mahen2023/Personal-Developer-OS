'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Braces } from 'lucide-react';
import { api } from '@/lib/api';
import { SNIPPET_LANGUAGES } from '@/lib/domain';
import type { Snippet } from '@/lib/types';
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
  TextArea,
  TextInput,
} from '@/components/patterns/Form';
import { CodeViewer } from '@/components/patterns/Markdown';

export function SnippetEditor({
  snippet,
  projectId,
  onDone,
  onCancel,
}: {
  snippet?: Snippet;
  projectId?: string | null;
  onDone?: (snippet: Snippet) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(snippet);

  const [form, setForm] = useState({
    title: snippet?.title ?? '',
    language: snippet?.language ?? 'typescript',
    code: snippet?.code ?? '',
    description: snippet?.description ?? '',
    projectId: snippet?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(snippet?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Snippet>(`/snippets/${snippet?.id}`, { method: 'PATCH', body })
      : api<Snippet>('/snippets', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      language: form.language,
      code: form.code,
      description: form.description || undefined,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/snippets/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={Braces} title="New snippet" />}

      <FormPanel
        title={editing ? 'Edit snippet' : 'Snippet'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={save.busy || !form.title.trim() || !form.code.trim()}
            >
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Save snippet'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/snippets">
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
            placeholder="Mongo transaction wrapper"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Language">
            <Select
              value={form.language}
              onChange={(event) => setForm({ ...form, language: event.target.value })}
              options={SNIPPET_LANGUAGES.map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Description" hint="When to reach for it.">
          <TextInput
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <Field label="Code" wide>
          <TextArea
            required
            mono
            rows={14}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            // Tab inserts a tab instead of leaving the field — the one place in
            // the app where escaping the control matters less than indenting.
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || event.shiftKey) return;
              event.preventDefault();
              const target = event.currentTarget;
              const { selectionStart, selectionEnd, value } = target;
              const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
              setForm({ ...form, code: next });
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = selectionStart + 2;
              });
            }}
          />
        </Field>

        {form.code.trim() && (
          <section aria-label="Preview">
            <div className="label mb-[6px]">Preview</div>
            <CodeViewer code={form.code} language={form.language} maxHeight="220px" />
          </section>
        )}

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
