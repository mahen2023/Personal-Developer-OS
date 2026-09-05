'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Database, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { DATABASE_TYPES, enumOptions } from '@/lib/domain';
import type { DatabaseInstance } from '@/lib/types';
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
  Select,
  TagInput,
  TextArea,
  TextInput,
  VaultItemSelect,
} from '@/components/patterns/Form';

/** Filled in when an engine is chosen, so the port is rarely typed by hand. */
const DEFAULT_PORT: Record<string, string> = {
  POSTGRESQL: '5432',
  MONGODB: '27017',
  MYSQL: '3306',
  REDIS: '6379',
  SQLITE: '',
  OTHER: '',
};

export function DatabaseEditor({
  database,
  projectId,
  onDone,
  onCancel,
}: {
  database?: DatabaseInstance;
  projectId?: string | null;
  onDone?: (database: DatabaseInstance) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(database);

  const [form, setForm] = useState({
    name: database?.name ?? '',
    type: database?.type ?? 'POSTGRESQL',
    host: database?.host ?? '',
    port: database?.port?.toString() ?? DEFAULT_PORT.POSTGRESQL,
    databaseName: database?.databaseName ?? '',
    username: database?.username ?? '',
    credentialId: database?.credentialId ?? null,
    version: database?.version ?? '',
    sizeMb: database?.sizeMb?.toString() ?? '',
    backupSchedule: database?.backupSchedule ?? '',
    lastBackupAt: database?.lastBackupAt ? database.lastBackupAt.slice(0, 10) : '',
    notes: database?.notes ?? '',
    environmentId: database?.environmentId ?? null,
    serverId: database?.serverId ?? null,
    projectId: database?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(database?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<DatabaseInstance>(`/databases/${database?.id}`, { method: 'PATCH', body })
      : api<DatabaseInstance>('/databases', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      name: form.name,
      type: form.type,
      host: form.host || undefined,
      port: number(form.port),
      databaseName: form.databaseName || undefined,
      username: form.username || undefined,
      credentialId: form.credentialId,
      version: form.version || undefined,
      sizeMb: number(form.sizeMb),
      backupSchedule: form.backupSchedule || undefined,
      lastBackupAt: form.lastBackupAt
        ? new Date(`${form.lastBackupAt}T12:00:00`).toISOString()
        : null,
      notes: form.notes || undefined,
      environmentId: form.environmentId,
      serverId: form.serverId,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/databases/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={Database} title="Add a database" />}

      <FormPanel
        title={editing ? 'Edit database' : 'Database'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.name.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add database'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/databases">
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
            placeholder="basuki-primary"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Engine">
            <Select
              value={form.type}
              onChange={(event) => {
                const type = event.target.value;
                setForm((current) => ({
                  ...current,
                  type,
                  port: DEFAULT_PORT[type] ?? current.port,
                }));
              }}
              options={enumOptions(DATABASE_TYPES)}
            />
          </Field>
          <Field label="Version">
            <TextInput
              value={form.version}
              onChange={(event) => setForm({ ...form, version: event.target.value })}
              placeholder="16.3"
              className="mono"
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Host">
            <TextInput
              value={form.host}
              onChange={(event) => setForm({ ...form, host: event.target.value })}
              placeholder="10.184.0.3"
              className="mono"
            />
          </Field>
          <Field label="Port">
            <TextInput
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(event) => setForm({ ...form, port: event.target.value })}
              className="mono"
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Database name">
            <TextInput
              value={form.databaseName}
              onChange={(event) => setForm({ ...form, databaseName: event.target.value })}
              className="mono"
            />
          </Field>
          <Field label="Username">
            <TextInput
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              className="mono"
            />
          </Field>
        </div>

        <Field
          label="Credential"
          hint="A vault reference. The password is never stored on this record (§17)."
        >
          <VaultItemSelect
            value={form.credentialId}
            onChange={(credentialId) => setForm({ ...form, credentialId })}
            noneLabel="No credential linked"
          />
        </Field>

        <Field label="Server">
          <EntitySelect<{ id: string; name: string }>
            path="/servers?limit=100"
            value={form.serverId}
            onChange={(serverId) => setForm({ ...form, serverId })}
            label="Server"
            noneLabel="Not on a recorded server"
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

        <div className="flex gap-3">
          <Field label="Backup schedule" hint="Free text — whatever you actually do.">
            <TextInput
              value={form.backupSchedule}
              onChange={(event) => setForm({ ...form, backupSchedule: event.target.value })}
              placeholder="daily 02:00"
            />
          </Field>
          <Field label="Last backup">
            <DateInput
              value={form.lastBackupAt}
              onChange={(event) => setForm({ ...form, lastBackupAt: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Size (MB)">
          <TextInput
            type="number"
            min={0}
            value={form.sizeMb}
            onChange={(event) => setForm({ ...form, sizeMb: event.target.value })}
          />
        </Field>

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

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          <ShieldCheck size={12} className="mt-[2px] shrink-0" />
          There is no password field here on purpose. Store it in the vault and link it above.
        </p>
      </FormPanel>
    </div>
  );
}

function number(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
