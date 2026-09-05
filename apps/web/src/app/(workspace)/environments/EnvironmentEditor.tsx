'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cloud } from 'lucide-react';
import { api } from '@/lib/api';
import { ENVIRONMENT_TYPES, enumOptions } from '@/lib/domain';
import type { Environment } from '@/lib/types';
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

export function EnvironmentEditor({
  environment,
  projectId,
  onDone,
  onCancel,
}: {
  environment?: Environment;
  projectId?: string | null;
  onDone?: (environment: Environment) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(environment);

  const [form, setForm] = useState({
    name: environment?.name ?? '',
    type: environment?.type ?? 'DEVELOPMENT',
    baseUrl: environment?.baseUrl ?? '',
    notes: environment?.notes ?? '',
    projectId: environment?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(environment?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Environment>(`/environments/${environment?.id}`, { method: 'PATCH', body })
      : api<Environment>('/environments', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      name: form.name,
      type: form.type,
      baseUrl: form.baseUrl || undefined,
      notes: form.notes || undefined,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/environments/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={Cloud}
          title="New environment"
          subtitle="Variables are added on the environment page once it exists."
        />
      )}

      <FormPanel
        title={editing ? 'Edit environment' : 'Environment'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.name.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Create environment'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/environments">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="Name">
          <TextInput
            autoFocus
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Production"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={enumOptions(ENVIRONMENT_TYPES)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Base URL">
          <TextInput
            value={form.baseUrl}
            onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
            placeholder="https://api.example.com"
            className="mono"
          />
        </Field>

        <Field label="Notes" wide>
          <TextArea
            rows={4}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
