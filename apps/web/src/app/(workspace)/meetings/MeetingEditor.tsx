'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { api } from '@/lib/api';
import type { Meeting } from '@/lib/types';
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

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function MeetingEditor({
  meeting,
  projectId,
  onDone,
  onCancel,
}: {
  meeting?: Meeting;
  projectId?: string | null;
  onDone?: (meeting: Meeting) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(meeting);

  const [form, setForm] = useState({
    title: meeting?.title ?? '',
    meetingDate: toLocalInput(meeting?.meetingDate),
    participants: (meeting?.participants ?? []).join(', '),
    discussion: meeting?.discussion ?? '',
    decisions: meeting?.decisions ?? '',
    actionItems: '',
    projectId: meeting?.projectId ?? projectId ?? null,
  });
  const [tags, setTags] = useState<string[]>(meeting?.tags?.map((tag) => tag.name) ?? []);

  const save = useAction((body: Record<string, unknown>) =>
    editing
      ? api<Meeting>(`/meetings/${meeting?.id}`, { method: 'PATCH', body })
      : api<Meeting>('/meetings', { method: 'POST', body }),
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await save.run({
      title: form.title,
      meetingDate: new Date(form.meetingDate).toISOString(),
      participants: form.participants
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      discussion: form.discussion || undefined,
      decisions: form.decisions || undefined,
      // Only sent on create; editing uses the dedicated action-items control so
      // saving a typo fix cannot silently duplicate every task.
      ...(editing
        ? {}
        : {
            actionItems: form.actionItems
              .split('\n')
              .map((line) => line.replace(/^[-*\s]+/, '').trim())
              .filter(Boolean),
          }),
      projectId: form.projectId,
      tags,
    });
    if (!saved) return;
    if (onDone) onDone(saved);
    else router.push(`/meetings/${saved.id}`);
  }

  return (
    <div className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      {!editing && <PageHeader icon={CalendarClock} title="Record a meeting" />}

      <FormPanel
        title={editing ? 'Edit meeting' : 'Meeting'}
        onSubmit={onSubmit}
        footer={
          <>
            <Button type="submit" variant="primary" disabled={save.busy || !form.title.trim()}>
              {save.busy ? 'Saving…' : editing ? 'Save changes' : 'Record meeting'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Link href="/meetings">
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
            placeholder="Post-mortem: v2.13.4 rollback"
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Date and time">
            <input
              type="datetime-local"
              required
              value={form.meetingDate}
              onChange={(event) => setForm({ ...form, meetingDate: event.target.value })}
              className="mono h-[30px] w-full rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-line)]"
            />
          </Field>
          <Field label="Project">
            <ProjectSelect
              value={form.projectId}
              onChange={(value) => setForm({ ...form, projectId: value })}
            />
          </Field>
        </div>

        <Field label="Participants" hint="Comma separated.">
          <TextInput
            value={form.participants}
            onChange={(event) => setForm({ ...form, participants: event.target.value })}
            placeholder="You, Platform on-call"
          />
        </Field>

        <Field label="Discussion" wide>
          <MarkdownEditor
            value={form.discussion}
            onChange={(discussion) => setForm({ ...form, discussion })}
            rows={8}
          />
        </Field>

        <Field label="Decisions" wide>
          <MarkdownEditor
            value={form.decisions}
            onChange={(decisions) => setForm({ ...form, decisions })}
            rows={4}
          />
        </Field>

        {!editing && (
          <Field
            label="Action items"
            hint="One per line. Each becomes a real task linked to this meeting."
          >
            <TextArea
              rows={4}
              value={form.actionItems}
              onChange={(event) => setForm({ ...form, actionItems: event.target.value })}
              placeholder={'Stagger restarts before the next release\nRaise the election timeout'}
            />
          </Field>
        )}

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} />
        </Field>
      </FormPanel>
    </div>
  );
}
