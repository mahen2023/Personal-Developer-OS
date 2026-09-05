'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { DEPLOYMENT_STATUS, optionsOf } from '@/lib/domain';
import type { Deployment } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  EntitySelect,
  EnvironmentSelect,
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  Select,
  TagInput,
  TextArea,
  TextInput,
} from '@/components/patterns/Form';

function toLocalInput(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function DeploymentEditor({
  deployment,
  projectId,
  onDone,
  onCancel,
}: {
  deployment?: Deployment;
  projectId?: string | null;
  onDone?: (deployment: Deployment) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(deployment);

  const [form, setForm] = useState({
    version: deployment?.version ?? '',
    commitSha: deployment?.commitSha ?? '',
    status: deployment?.status ?? 'SUCCESS',
    deployedBy: deployment?.deployedBy ?? '',
    deployedAt: toLocalInput(deployment?.deployedAt),
    durationSec: deployment?.durationSec?.toString() ?? '',
    notes: deployment?.notes ?? '',
    repositoryId: deployment?.repositoryId ?? null,
    environmentId: deployment?.environmentId ?? null,
    serverId: deployment?.serverId ?? null,
    projectId: deployment?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(deployment?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Deployment>(`/deployments/${deployment?.id}`, { method: 'PATCH', body })
      : api<Deployment>('/deployments', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number.parseInt(form.durationSec, 10);
    const saved = await save.run({
      version: form.version || undefined,
      commitSha: form.commitSha || undefined,
      status: form.status,
      deployedBy: form.deployedBy || undefined,
      deployedAt: new Date(form.deployedAt).toISOString(),
      durationSec: Number.isFinite(parsed) ? parsed : undefined,
      notes: form.notes || undefined,
      repositoryId: form.repositoryId,
      environmentId: form.environmentId,
      serverId: form.serverId,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/deployments/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      {!editing && (
        <PageHeader
          icon={Rocket}
          title="Record a deployment"
          subtitle="What went out, where, and how it went."
        />
      )}

      <FormPanel
        title={editing ? 'Edit deployment' : 'Deployment'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Record deployment'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/deployments">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <div className="flex gap-3">
          <Field label="Version">
            <TextInput
              autoFocus
              value={form.version}
              onChange={(event) => setForm({ ...form, version: event.target.value })}
              placeholder="v2.14.0"
              className="mono"
            />
          </Field>
          <Field label="Commit">
            <TextInput
              value={form.commitSha}
              onChange={(event) => setForm({ ...form, commitSha: event.target.value })}
              placeholder="9f3c1ab"
              className="mono"
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(DEPLOYMENT_STATUS)}
            />
          </Field>
          <Field label="Deployed by">
            <TextInput
              value={form.deployedBy}
              onChange={(event) => setForm({ ...form, deployedBy: event.target.value })}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="When">
            <input
              type="datetime-local"
              required
              value={form.deployedAt}
              onChange={(event) => setForm({ ...form, deployedAt: event.target.value })}
              className="mono h-[30px] w-full rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-line)]"
            />
          </Field>
          <Field label="Duration (s)">
            <TextInput
              type="number"
              min={0}
              value={form.durationSec}
              onChange={(event) => setForm({ ...form, durationSec: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Repository">
          <EntitySelect<{ id: string; name: string }>
            path="/repositories?limit=100"
            value={form.repositoryId}
            onChange={(repositoryId) => setForm({ ...form, repositoryId })}
            label="Repository"
            noneLabel="No repository"
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
          <Field label="Server">
            <EntitySelect<{ id: string; name: string }>
              path="/servers?limit=100"
              value={form.serverId}
              onChange={(serverId) => setForm({ ...form, serverId })}
              label="Server"
              noneLabel="No server"
              render={(row) => row.name}
            />
          </Field>
        </div>

        <Field label="Project">
          <ProjectSelect
            value={form.projectId}
            onChange={(value) => setForm({ ...form, projectId: value, environmentId: null })}
          />
        </Field>

        <Field label="Notes" wide hint="Especially useful on a rollback: what went wrong.">
          <TextArea
            rows={3}
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
