'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { ISSUE_STATUS, PRIORITY, optionsOf } from '@/lib/domain';
import type { Issue } from '@/lib/types';
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

export function IssueEditor({
  issue,
  projectId,
  onDone,
  onCancel,
}: {
  issue?: Issue;
  projectId?: string | null;
  onDone?: (issue: Issue) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(issue);

  const [form, setForm] = useState({
    title: issue?.title ?? '',
    description: issue?.description ?? '',
    errorMessage: issue?.errorMessage ?? '',
    status: issue?.status ?? 'OPEN',
    priority: issue?.priority ?? 'MEDIUM',
    projectId: issue?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(issue?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Issue>(`/issues/${issue?.id}`, { method: 'PATCH', body })
      : api<Issue>('/issues', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      description: form.description || undefined,
      errorMessage: form.errorMessage || undefined,
      status: form.status,
      priority: form.priority,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/issues/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={TriangleAlert}
          title="Log an issue"
          subtitle="Paste the error as-is. The next screen shows whether you have hit it before."
        />
      )}

      <FormPanel
        title={editing ? 'Edit issue' : 'Issue'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Log issue'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/issues">
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
            placeholder="Nginx returns 502 after redeploy"
          />
        </Field>

        <Field label="Error message" hint="Verbatim. This is what the suggestions match on.">
          <TextArea
            rows={3}
            mono
            value={form.errorMessage}
            onChange={(event) => setForm({ ...form, errorMessage: event.target.value })}
          />
        </Field>

        <Field label="Description" hint="When it happens, what you have already ruled out.">
          <TextArea
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(ISSUE_STATUS)}
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
