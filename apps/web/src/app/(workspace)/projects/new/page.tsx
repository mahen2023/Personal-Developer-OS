'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { api } from '@/lib/api';
import { PRIORITY, PROJECT_STATUS, optionsOf } from '@/lib/domain';
import type { Project } from '@/lib/types';
import { useAction } from '@/hooks/useResource';
import { Button } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import {
  DateInput,
  Field,
  FormError,
  FormPanel,
  Select,
  TagInput,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/patterns/Form';

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    client: '',
    color: '#e0a458',
    startDate: '',
    targetDate: '',
    techStack: '',
    isFavorite: false,
  });
  const [tags, setTags] = useState<string[]>([]);

  const create = useAction((body: Record<string, unknown>) =>
    api<Project>('/projects', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const project = await create.run({
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      priority: form.priority,
      client: form.client || undefined,
      color: form.color,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : undefined,
      techStack: form.techStack
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      isFavorite: form.isFavorite,
      tags,
    });
    if (project) router.push(`/projects/${project.slug}`);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      <PageHeader icon={Boxes} title="New project" subtitle="Only the name is required." />

      <FormPanel
        title="Project"
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={create.busy || !form.name.trim()}>
              {create.busy ? 'Creating…' : 'Create project'}
            </Button>
            <Link href="/projects">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
          </>
        }
      >
        <FormError error={create.error} />

        <Field label="Name">
          <TextInput
            autoFocus
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Basuki Automaton"
          />
        </Field>

        <Field label="Description" hint="What is it, in one or two lines.">
          <TextArea
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={optionsOf(PROJECT_STATUS)}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
              options={optionsOf(PRIORITY)}
            />
          </Field>
        </div>

        <Field label="Client" hint="Leave blank for personal work.">
          <TextInput
            value={form.client}
            onChange={(event) => setForm({ ...form, client: event.target.value })}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Start date">
            <DateInput
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </Field>
          <Field label="Target date">
            <DateInput
              value={form.targetDate}
              onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
            />
          </Field>
        </div>

        <Field label="Tech stack" hint="Comma separated.">
          <TextInput
            value={form.techStack}
            onChange={(event) => setForm({ ...form, techStack: event.target.value })}
            placeholder="TypeScript, NestJS, PostgreSQL, Docker"
          />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>

        <Field label="Accent">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
              aria-label="Project colour"
              className="h-[26px] w-[40px] cursor-pointer rounded border border-line bg-transparent"
            />
            <Toggle
              checked={form.isFavorite}
              onChange={(isFavorite) => setForm({ ...form, isFavorite })}
              label="Pin to favourites"
            />
          </div>
        </Field>
      </FormPanel>
    </div>
  );
}
