'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import type { SslCertificate } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  DateInput,
  EntitySelect,
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

/** Let's Encrypt is 90 days; offered as the default so the date is one click. */
function ninetyDaysFromNow(): string {
  return new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
}

export function CertificateEditor({
  certificate,
  projectId,
  onDone,
  onCancel,
}: {
  certificate?: SslCertificate;
  projectId?: string | null;
  onDone?: (certificate: SslCertificate) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(certificate);

  const [form, setForm] = useState({
    commonName: certificate?.commonName ?? '',
    issuer: certificate?.issuer ?? '',
    issuedAt: certificate?.issuedAt ? certificate.issuedAt.slice(0, 10) : '',
    expiresAt: certificate?.expiresAt ? certificate.expiresAt.slice(0, 10) : ninetyDaysFromNow(),
    autoRenew: certificate?.autoRenew ?? true,
    notes: certificate?.notes ?? '',
    domainId: certificate?.domainId ?? null,
    environmentId: certificate?.environmentId ?? null,
    projectId: certificate?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(certificate?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<SslCertificate>(`/certificates/${certificate?.id}`, { method: 'PATCH', body })
      : api<SslCertificate>('/certificates', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      commonName: form.commonName,
      issuer: form.issuer || undefined,
      issuedAt: form.issuedAt ? new Date(`${form.issuedAt}T12:00:00`).toISOString() : null,
      expiresAt: new Date(`${form.expiresAt}T12:00:00`).toISOString(),
      autoRenew: form.autoRenew,
      notes: form.notes || undefined,
      domainId: form.domainId,
      environmentId: form.environmentId,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/certificates/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={ShieldCheck}
          title="Add a certificate"
          subtitle="Recording the dates — the certificate itself is issued elsewhere."
        />
      )}

      <FormPanel
        title={editing ? 'Edit certificate' : 'Certificate'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={save.busy || !form.commonName.trim() || !form.expiresAt}
            >
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add certificate'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/certificates">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="Common name">
          <TextInput
            autoFocus
            required
            value={form.commonName}
            onChange={(event) => setForm({ ...form, commonName: event.target.value })}
            placeholder="api.example.com"
            className="mono"
          />
        </Field>

        <Field label="Issuer">
          <TextInput
            value={form.issuer}
            onChange={(event) => setForm({ ...form, issuer: event.target.value })}
            placeholder="Let's Encrypt R11"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Issued">
            <DateInput
              value={form.issuedAt}
              onChange={(event) => setForm({ ...form, issuedAt: event.target.value })}
            />
          </Field>
          <Field label="Expires">
            <DateInput
              required
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Domain">
          <EntitySelect<{ id: string; name: string }>
            path="/domains?limit=100"
            value={form.domainId}
            onChange={(domainId) => setForm({ ...form, domainId })}
            label="Domain"
            noneLabel="Not linked to a recorded domain"
            render={(row) => row.name}
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
            placeholder="Where the renewal hook lives, and what breaks when it does not run."
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <Toggle
          checked={form.autoRenew}
          onChange={(autoRenew) => setForm({ ...form, autoRenew })}
          label="Renews automatically"
        />
      </FormPanel>
    </div>
  );
}
