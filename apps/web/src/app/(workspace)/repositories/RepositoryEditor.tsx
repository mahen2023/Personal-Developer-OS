'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderGit2 } from 'lucide-react';
import { api } from '@/lib/api';
import { REPO_PROVIDERS, enumOptions } from '@/lib/domain';
import type { Repository } from '@/lib/types';
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
  Toggle,
} from '@/components/patterns/Form';

/** Mirrors the server-side guess so the field fills in as you paste. */
function guessProvider(url: string): string {
  const host = url.toLowerCase();
  if (host.includes('github.')) return 'GITHUB';
  if (host.includes('gitlab.')) return 'GITLAB';
  if (host.includes('bitbucket.')) return 'BITBUCKET';
  if (host.includes('dev.azure.com') || host.includes('visualstudio.com')) return 'AZURE_DEVOPS';
  return 'OTHER';
}

/** `https://github.com/example/basuki-api.git` -> `basuki-api` */
function guessName(url: string): string {
  const last =
    url
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
      .pop() ?? '';
  return last;
}

export function RepositoryEditor({
  repository,
  projectId,
  onDone,
  onCancel,
}: {
  repository?: Repository;
  projectId?: string | null;
  onDone?: (repository: Repository) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(repository);

  const [form, setForm] = useState({
    name: repository?.name ?? '',
    url: repository?.url ?? '',
    provider: repository?.provider ?? 'GITHUB',
    localPath: repository?.localPath ?? '',
    defaultBranch: repository?.defaultBranch ?? 'main',
    language: repository?.language ?? '',
    description: repository?.description ?? '',
    isPrivate: repository?.isPrivate ?? true,
    projectId: repository?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(repository?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Repository>(`/repositories/${repository?.id}`, { method: 'PATCH', body })
      : api<Repository>('/repositories', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      name: form.name,
      url: form.url,
      provider: form.provider,
      localPath: form.localPath || undefined,
      defaultBranch: form.defaultBranch || undefined,
      language: form.language || undefined,
      description: form.description || undefined,
      isPrivate: form.isPrivate,
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/repositories/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={FolderGit2} title="Add a repository" />}

      <FormPanel
        title={editing ? 'Edit repository' : 'Repository'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button
              type="submit"
              variant="primary"
              disabled={save.busy || !form.name.trim() || !form.url.trim()}
            >
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Add repository'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/repositories">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            )}
          </>
        }
      >
        <FormError error={save.error} />

        <Field label="URL" hint="Paste it first — the name and provider fill themselves in.">
          <TextInput
            autoFocus
            required
            value={form.url}
            onChange={(event) => {
              const url = event.target.value;
              setForm((current) => ({
                ...current,
                url,
                provider: guessProvider(url),
                name: current.name || guessName(url),
              }));
            }}
            placeholder="https://github.com/example/basuki-api"
          />
        </Field>

        <Field label="Name">
          <TextInput
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Provider">
            <Select
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              options={enumOptions(REPO_PROVIDERS)}
            />
          </Field>
          <Field label="Default branch">
            <TextInput
              value={form.defaultBranch}
              onChange={(event) => setForm({ ...form, defaultBranch: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Local path" hint="Where it is checked out on this machine.">
          <TextInput
            value={form.localPath}
            onChange={(event) => setForm({ ...form, localPath: event.target.value })}
            placeholder="E:/Projects/basuki-api"
            className="mono"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Language">
            <TextInput
              value={form.language}
              onChange={(event) => setForm({ ...form, language: event.target.value })}
              placeholder="TypeScript"
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Description">
          <TextArea
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <Toggle
          checked={form.isPrivate}
          onChange={(isPrivate) => setForm({ ...form, isPrivate })}
          label="Private repository"
        />
      </FormPanel>
    </div>
  );
}
