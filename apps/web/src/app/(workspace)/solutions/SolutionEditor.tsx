'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircuitBoard } from 'lucide-react';
import { api } from '@/lib/api';
import type { Solution } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  TagInput,
  TextArea,
  TextInput,
} from '@/components/patterns/Form';
import { MarkdownEditor } from '@/components/patterns/Markdown';

export function SolutionEditor({
  solution,
  projectId,
  onDone,
  onCancel,
}: {
  solution?: Solution;
  projectId?: string | null;
  onDone?: (solution: Solution) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(solution);

  const [form, setForm] = useState({
    title: solution?.title ?? '',
    problem: solution?.problem ?? '',
    errorMessage: solution?.errorMessage ?? '',
    environment: solution?.environment ?? '',
    rootCause: solution?.rootCause ?? '',
    solution: solution?.solution ?? '',
    // Commands are one per line in the form and an array on the wire.
    commands: (solution?.commands ?? []).join('\n'),
    links: (solution?.links ?? []).join('\n'),
    projectId: solution?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(solution?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Solution>(`/solutions/${solution?.id}`, { method: 'PATCH', body })
      : api<Solution>('/solutions', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      problem: form.problem,
      solution: form.solution,
      errorMessage: form.errorMessage || undefined,
      environment: form.environment || undefined,
      rootCause: form.rootCause || undefined,
      commands: lines(form.commands),
      links: lines(form.links),
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/solutions/${saved.id}`);
  }

  const ready = form.title.trim() && form.problem.trim() && form.solution.trim();

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={CircuitBoard}
          title="Record a solution"
          subtitle="Written now, while it is still accurate. The error text is what makes it findable later."
        />
      )}

      <FormPanel
        title={editing ? 'Edit solution' : 'Solution'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !ready}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Record solution'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/solutions">
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
            placeholder="MongoDB replica set configuration"
          />
        </Field>

        <Field label="Problem" hint="What was happening, in your own words.">
          <TextArea
            rows={3}
            required
            value={form.problem}
            onChange={(event) => setForm({ ...form, problem: event.target.value })}
          />
        </Field>

        <Field
          label="Error message"
          hint="Paste it verbatim — this is what future-you will search for."
        >
          <TextArea
            rows={2}
            mono
            value={form.errorMessage}
            onChange={(event) => setForm({ ...form, errorMessage: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Environment">
            <TextInput
              value={form.environment}
              onChange={(event) => setForm({ ...form, environment: event.target.value })}
              placeholder="Docker · MongoDB 7.0 · single node"
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Root cause" hint="Why it happened, not just what fixed it.">
          <TextArea
            rows={2}
            value={form.rootCause}
            onChange={(event) => setForm({ ...form, rootCause: event.target.value })}
          />
        </Field>

        <Field label="The fix" wide>
          <MarkdownEditor
            value={form.solution}
            onChange={(value) => setForm({ ...form, solution: value })}
            rows={10}
            placeholder="What you did, step by step."
          />
        </Field>

        <Field label="Commands" hint="One per line. Copyable from the solution page.">
          <TextArea
            rows={3}
            mono
            value={form.commands}
            onChange={(event) => setForm({ ...form, commands: event.target.value })}
            placeholder={'docker compose exec mongo mongosh --eval "rs.initiate()"'}
          />
        </Field>

        <Field label="References" hint="One URL per line.">
          <TextArea
            rows={2}
            mono
            value={form.links}
            onChange={(event) => setForm({ ...form, links: event.target.value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}

export function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
