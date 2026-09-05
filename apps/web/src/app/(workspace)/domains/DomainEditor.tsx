'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { api } from '@/lib/api';
import type { Domain } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  DateInput,
  EnvironmentSelect,
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  TagInput,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/patterns/Form';

/** Pasting a full URL is the usual mistake; take the hostname out of it. */
function hostnameOf(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/.*$/, '').toLowerCase();
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed;
  }
}

export function DomainEditor({
  domain,
  projectId,
  onDone,
  onCancel,
}: {
  domain?: Domain;
  projectId?: string | null;
  onDone?: (domain: Domain) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(domain);

  const [form, setForm] = useState({
    name: domain?.name ?? '',
    registrar: domain?.registrar ?? '',
    dnsProvider: domain?.dnsProvider ?? '',
    expiresAt: domain?.expiresAt ? domain.expiresAt.slice(0, 10) : '',
    autoRenew: domain?.autoRenew ?? false,
    notes: domain?.notes ?? '',
    environmentId: domain?.environmentId ?? null,
    projectId: domain?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(domain?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Domain>(`/domains/${domain?.id}`, { method: 'PATCH', body })
      : api<Domain>('/domains', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      name: form.name,
      registrar: form.registrar || undefined,
      dnsProvider: form.dnsProvider || undefined,
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T12:00:00`).toISOString() : null,
      autoRenew: form.autoRenew,
      notes: form.notes || undefined,
      environmentId: form.environmentId,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/domains/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={Globe} title="Add a domain" />}

      <FormPanel
        title={editing ? 'Edit domain' : 'Domain'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.name.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add domain'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/domains">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="Domain" hint="Hostname only — a pasted URL is trimmed for you.">
          <TextInput
            autoFocus
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            onBlur={(event) => setForm({ ...form, name: hostnameOf(event.target.value) })}
            placeholder="api.example.com"
            className="mono"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Registrar">
            <TextInput
              value={form.registrar}
              onChange={(event) => setForm({ ...form, registrar: event.target.value })}
              placeholder="Cloudflare"
            />
          </Field>
          <Field label="DNS provider">
            <TextInput
              value={form.dnsProvider}
              onChange={(event) => setForm({ ...form, dnsProvider: event.target.value })}
              placeholder="Cloudflare"
            />
          </Field>
        </div>

        <Field label="Expires" hint="The dashboard warns you 45 days out.">
          <DateInput
            value={form.expiresAt}
            onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Environment">
            <EnvironmentSelect
              value={form.environmentId}
              onChange={(environmentId) => setForm({ ...form, environmentId })}
              projectId={form.projectId}
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value, environmentId: null })}
            />
          </Field>
        </div>

        <Field label="Notes" wide>
          <TextArea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <Toggle
          checked={form.autoRenew}
          onChange={(autoRenew) => setForm({ ...form, autoRenew })}
          label="Auto-renewal is enabled at the registrar"
        />
      </FormPanel>
    </div>
  );
}
