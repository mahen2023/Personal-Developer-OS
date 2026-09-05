'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Server as ServerIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { SERVER_PROVIDERS, SERVER_STATUS, enumOptions, optionsOf } from '@/lib/domain';
import type { Server } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  EnvironmentSelect,
  Field,
  FormError,
  FormPanel,
  ProjectSelect,
  Select,
  TagInput,
  TextArea,
  TextInput,
  VaultItemSelect,
} from '@/components/patterns/Form';

export function ServerEditor({
  server,
  projectId,
  onDone,
  onCancel,
}: {
  server?: Server;
  projectId?: string | null;
  onDone?: (server: Server) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(server);

  const [form, setForm] = useState({
    name: server?.name ?? '',
    provider: server?.provider ?? 'OTHER',
    ipAddress: server?.ipAddress ?? '',
    hostname: server?.hostname ?? '',
    os: server?.os ?? '',
    cpuCores: server?.cpuCores?.toString() ?? '',
    ramGb: server?.ramGb?.toString() ?? '',
    diskGb: server?.diskGb?.toString() ?? '',
    region: server?.region ?? '',
    sshUsername: server?.sshUsername ?? '',
    sshPort: server?.sshPort?.toString() ?? '22',
    sshKeyId: server?.sshKeyId ?? null,
    services: (server?.services ?? []).join(', '),
    status: server?.status ?? 'UNKNOWN',
    notes: server?.notes ?? '',
    environmentId: server?.environmentId ?? null,
    projectId: server?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(server?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Server>(`/servers/${server?.id}`, { method: 'PATCH', body })
      : api<Server>('/servers', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      name: form.name,
      provider: form.provider,
      ipAddress: form.ipAddress || undefined,
      hostname: form.hostname || undefined,
      os: form.os || undefined,
      cpuCores: number(form.cpuCores),
      ramGb: number(form.ramGb),
      diskGb: number(form.diskGb),
      region: form.region || undefined,
      sshUsername: form.sshUsername || undefined,
      sshPort: number(form.sshPort),
      sshKeyId: form.sshKeyId,
      services: form.services
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      status: form.status,
      notes: form.notes || undefined,
      environmentId: form.environmentId,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/servers/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={ServerIcon} title="Add a server" />}

      <FormPanel
        title={editing ? 'Edit server' : 'Server'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.name.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add server'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/servers">
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
            placeholder="Production API"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Provider">
            <Select
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              options={enumOptions(SERVER_PROVIDERS)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(SERVER_STATUS)}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Hostname">
            <TextInput
              value={form.hostname}
              onChange={(event) => setForm({ ...form, hostname: event.target.value })}
              placeholder="basuki-api-prod"
              className="mono"
            />
          </Field>
          <Field label="IP address">
            <TextInput
              value={form.ipAddress}
              onChange={(event) => setForm({ ...form, ipAddress: event.target.value })}
              placeholder="34.101.14.22"
              className="mono"
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Operating system">
            <TextInput
              value={form.os}
              onChange={(event) => setForm({ ...form, os: event.target.value })}
              placeholder="Ubuntu 24.04 LTS"
            />
          </Field>
          <Field label="Region">
            <TextInput
              value={form.region}
              onChange={(event) => setForm({ ...form, region: event.target.value })}
              placeholder="asia-southeast2"
              className="mono"
            />
          </Field>
        </div>

        <Field label="Specs" hint="CPU cores, memory in GB, disk in GB.">
          <div className="flex gap-2">
            <TextInput
              type="number"
              min={1}
              value={form.cpuCores}
              onChange={(event) => setForm({ ...form, cpuCores: event.target.value })}
              placeholder="CPU"
              aria-label="CPU cores"
            />
            <TextInput
              type="number"
              min={1}
              value={form.ramGb}
              onChange={(event) => setForm({ ...form, ramGb: event.target.value })}
              placeholder="RAM GB"
              aria-label="Memory in GB"
            />
            <TextInput
              type="number"
              min={1}
              value={form.diskGb}
              onChange={(event) => setForm({ ...form, diskGb: event.target.value })}
              placeholder="Disk GB"
              aria-label="Disk in GB"
            />
          </div>
        </Field>

        <Field label="Services" hint="Comma separated — what actually runs on it.">
          <TextInput
            value={form.services}
            onChange={(event) => setForm({ ...form, services: event.target.value })}
            placeholder="Docker, MongoDB, Redis, Nginx"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="SSH user">
            <TextInput
              value={form.sshUsername}
              onChange={(event) => setForm({ ...form, sshUsername: event.target.value })}
              placeholder="deploy"
              className="mono"
            />
          </Field>
          <Field label="SSH port">
            <TextInput
              type="number"
              min={1}
              max={65535}
              value={form.sshPort}
              onChange={(event) => setForm({ ...form, sshPort: event.target.value })}
              className="mono"
            />
          </Field>
        </div>

        <Field
          label="SSH key"
          hint="A reference to a vault item. The key itself is never stored on this record."
        >
          <VaultItemSelect
            value={form.sshKeyId}
            onChange={(sshKeyId) => setForm({ ...form, sshKeyId })}
            type="SSH_KEY"
            noneLabel="No key linked"
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
            rows={4}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Anything you would want to know at 3am."
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          <KeyRound size={12} className="mt-[2px] shrink-0" />
          No password or private key is ever stored here. Credentials live in the vault; this record
          only points at them.
        </p>
      </FormPanel>
    </div>
  );
}

function number(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
