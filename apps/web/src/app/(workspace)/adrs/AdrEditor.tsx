'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { ADR_STATUS, optionsOf } from '@/lib/domain';
import type { Adr } from '@/lib/types';
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

export function AdrEditor({
  adr,
  projectId,
  onDone,
  onCancel,
}: {
  adr?: Adr;
  projectId?: string | null;
  onDone?: (adr: Adr) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(adr);

  const [form, setForm] = useState({
    title: adr?.title ?? '',
    status: adr?.status ?? 'PROPOSED',
    context: adr?.context ?? '',
    decision: adr?.decision ?? '',
    alternatives: adr?.alternatives ?? '',
    consequences: adr?.consequences ?? '',
    projectId: adr?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(adr?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Adr>(`/adrs/${adr?.id}`, { method: 'PATCH', body })
      : api<Adr>('/adrs', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      status: form.status,
      context: form.context,
      decision: form.decision,
      alternatives: form.alternatives || undefined,
      consequences: form.consequences || undefined,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/adrs/${saved.id}`);
  }

  const ready = form.title.trim() && form.context.trim() && form.decision.trim();

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={ScrollText}
          title="New decision record"
          subtitle="The number is assigned on save and never reused."
        />
      )}

      <FormPanel
        title={editing ? `Edit ADR-${String(adr?.number).padStart(3, '0')}` : 'Decision record'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !ready}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Record decision'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/adrs">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="Title" hint="State the decision, not the topic.">
          <TextInput
            autoFocus
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Run MongoDB as a single-node replica set"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(ADR_STATUS)}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field
          label="Context"
          hint="What forced a decision. Written so it still makes sense in a year."
          wide
        >
          <MarkdownEditor
            value={form.context}
            onChange={(context) => setForm({ ...form, context })}
            rows={5}
            placeholder="The domain model needs multi-document transactions, which standalone MongoDB does not support."
          />
        </Field>

        <Field label="Decision" wide>
          <MarkdownEditor
            value={form.decision}
            onChange={(decision) => setForm({ ...form, decision })}
            rows={5}
            placeholder="Run a single-member replica set in every environment, including local development."
          />
        </Field>

        <Field
          label="Alternatives"
          hint="What you considered and rejected — the part people forget."
          wide
        >
          <MarkdownEditor
            value={form.alternatives}
            onChange={(alternatives) => setForm({ ...form, alternatives })}
            rows={4}
          />
        </Field>

        <Field label="Consequences" hint="What this costs, not just what it buys." wide>
          <MarkdownEditor
            value={form.consequences}
            onChange={(consequences) => setForm({ ...form, consequences })}
            rows={4}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
