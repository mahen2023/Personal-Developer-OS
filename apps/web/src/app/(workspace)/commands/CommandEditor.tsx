'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Terminal, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { COMMAND_PLATFORMS, DANGER_LEVEL, enumOptions, optionsOf } from '@/lib/domain';
import type { CommandRecord } from '@/lib/types';
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

/**
 * Mirrors the server-side check in commands.service.ts so the warning appears
 * as you type. The server still decides — this is a hint, not the rule.
 */
const LOOKS_DESTRUCTIVE = [
  /\brm\s+-[rf]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(drop|truncate)\s+(database|table|schema)\b/i,
  /\bdocker\s+system\s+prune\b/i,
  /\bdocker\s+volume\s+rm\b/i,
  /\bkubectl\s+delete\b/i,
  /\bgit\s+push\s+.*--force(?!-with-lease)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bshutdown\b|\breboot\b/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bterraform\s+destroy\b/i,
];

export function CommandEditor({
  command,
  projectId,
  onDone,
  onCancel,
}: {
  command?: CommandRecord;
  projectId?: string | null;
  onDone?: (command: CommandRecord) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(command);

  const [form, setForm] = useState({
    title: command?.title ?? '',
    command: command?.command ?? '',
    description: command?.description ?? '',
    category: command?.category ?? '',
    platform: command?.platform ?? 'ANY',
    dangerLevel: command?.dangerLevel ?? 'SAFE',
    projectId: command?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(command?.tags?.map((tag) => tag.name) ?? []);

  const willBeRaised =
    form.dangerLevel !== 'DESTRUCTIVE' && LOOKS_DESTRUCTIVE.some((rule) => rule.test(form.command));

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<CommandRecord>(`/commands/${command?.id}`, { method: 'PATCH', body })
      : api<CommandRecord>('/commands', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      command: form.command,
      description: form.description || undefined,
      category: form.category || undefined,
      platform: form.platform,
      dangerLevel: form.dangerLevel,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/commands/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={Terminal} title="New command" />}

      <FormPanel
        title={editing ? 'Edit command' : 'Command'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={save.busy || !form.title.trim() || !form.command.trim()}
            >
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Save command'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/commands">
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
            placeholder="Docker cleanup"
          />
        </Field>

        <Field label="Command" wide>
          <TextArea
            required
            mono
            rows={3}
            value={form.command}
            onChange={(event) => setForm({ ...form, command: event.target.value })}
            placeholder="docker system prune -a --volumes"
          />
        </Field>

        {willBeRaised && (
          <p className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12px]">
            <TriangleAlert size={13} className="mt-[2px] shrink-0 text-[var(--danger)]" />
            This looks destructive, so it will be saved as DESTRUCTIVE whatever is selected below.
            Copying it will ask for confirmation.
          </p>
        )}

        <Field label="Description" hint="What it does, and when not to run it.">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Platform">
            <Select
              value={form.platform}
              onChange={(event) => setForm({ ...form, platform: event.target.value })}
              options={enumOptions(COMMAND_PLATFORMS)}
            />
          </Field>
          <Field label="Danger">
            <Select
              value={form.dangerLevel}
              onChange={(event) => setForm({ ...form, dangerLevel: event.target.value })}
              options={optionsOf(DANGER_LEVEL)}
            />
          </Field>
        </div>

        <div className="flex gap-3">
          <Field label="Category">
            <TextInput
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Docker"
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
