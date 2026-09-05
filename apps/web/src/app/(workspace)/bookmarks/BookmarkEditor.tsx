'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookMarked } from 'lucide-react';
import { api } from '@/lib/api';
import { BOOKMARK_CATEGORIES, enumOptions } from '@/lib/domain';
import type { Bookmark } from '@/lib/types';
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

/** Mirrors the server-side guess, so the category fills in as you paste. */
function guessCategory(url: string): string {
  const rules: [RegExp, string][] = [
    [/github\.com|gitlab\.com|bitbucket\.org/i, 'GITHUB'],
    [/aws\.amazon\.com|cloud\.google\.com|azure\.microsoft\.com|cloudflare\.com/i, 'CLOUD'],
    [/anthropic\.com|openai\.com|huggingface\.co/i, 'AI'],
    [/postgresql\.org|mongodb\.com|redis\.io|mysql\.com/i, 'DATABASE'],
    [/docker\.com|kubernetes\.io|terraform\.io|ansible\.com/i, 'DEVOPS'],
    [/owasp\.org|cve\.mitre\.org|nvd\.nist\.gov/i, 'SECURITY'],
    [/docs\.|developer\.|\/docs\//i, 'DOCUMENTATION'],
  ];
  return rules.find(([pattern]) => pattern.test(url))?.[1] ?? 'OTHER';
}

export function BookmarkEditor({
  bookmark,
  projectId,
  onDone,
  onCancel,
}: {
  bookmark?: Bookmark;
  projectId?: string | null;
  onDone?: (bookmark: Bookmark) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(bookmark);

  const [form, setForm] = useState({
    title: bookmark?.title ?? '',
    url: bookmark?.url ?? '',
    description: bookmark?.description ?? '',
    category: bookmark?.category ?? 'OTHER',
    projectId: bookmark?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(bookmark?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Bookmark>(`/bookmarks/${bookmark?.id}`, { method: 'PATCH', body })
      : api<Bookmark>('/bookmarks', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      url: form.url,
      description: form.description || undefined,
      category: form.category,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/bookmarks/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={BookMarked} title="Add a bookmark" />}

      <FormPanel
        title={editing ? 'Edit bookmark' : 'Bookmark'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={save.busy || !form.title.trim() || !form.url.trim()}
            >
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add bookmark'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/bookmarks">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="URL" hint="Paste first — the category fills itself in.">
          <TextInput
            autoFocus
            required
            value={form.url}
            onChange={(event) => {
              const url = event.target.value;
              setForm((current) => ({ ...current, url, category: guessCategory(url) }));
            }}
            placeholder="https://www.mongodb.com/docs/manual/core/transactions/"
          />
        </Field>

        <Field label="Title">
          <TextInput
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              options={enumOptions(BOOKMARK_CATEGORIES)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Note" hint="Why this one is worth keeping.">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
