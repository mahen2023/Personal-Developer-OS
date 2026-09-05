'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { PRIORITY, TASK_STATUS } from '@/lib/domain';
import type { Meeting } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { TextArea } from '@/components/patterns/Form';
import { MeetingEditor } from '../MeetingEditor';

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const { data: meeting, loading, set } = useRecord<Meeting>(`/meetings/${id}`);

  const addItems = useAction((titles: string[]) =>
    api<Meeting>(`/meetings/${id}/action-items`, { method: 'POST', body: { titles } }),
  );

  useContextPanel('Meeting', meeting ? <MeetingContext meeting={meeting} /> : null, [
    meeting?.id,
    meeting?.updatedAt,
    meeting?.actionItems?.length,
  ]);

  if (loading && !meeting) return <LoadingLine message="Loading meeting…" />;
  if (!meeting) return null;

  if (editing) {
    return (
      <MeetingEditor
        meeting={meeting}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  async function promote() {
    const titles = draft
      .split('\n')
      .map((line) => line.replace(/^[-*\s]+/, '').trim())
      .filter(Boolean);
    if (titles.length === 0) return;
    const saved = await addItems.run(titles);
    if (saved) {
      set(saved);
      setDraft('');
      setAdding(false);
    }
  }

  const items = meeting.actionItems ?? [];

  return (
    <DetailShell
      title={meeting.title}
      eyebrow="Meeting"
      onEdit={() => setEditing(true)}
      deletePath={`/meetings/${id}`}
      deleteBackTo="/meetings"
      deleteConfirm={`Delete "${meeting.title}"? Its action items stay — they are ordinary tasks now.`}
      meta={
        <>
          <span>{new Date(meeting.meetingDate).toLocaleString()}</span>
          {meeting.participants.length > 0 && (
            <span className="flex items-center gap-[5px]">
              <Users size={10} /> {meeting.participants.join(', ')}
            </span>
          )}
          {meeting.project && (
            <Link href={`/projects/${meeting.project.slug}`} className="hover:text-[var(--accent)]">
              {meeting.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {meeting.decisions && (
          <Section title="Decisions">
            <Markdown>{meeting.decisions}</Markdown>
          </Section>
        )}

        <Section
          title={`Action items · ${items.length}`}
          action={
            <Button variant="ghost" onClick={() => setAdding((open) => !open)}>
              <Plus size={12} /> Add
            </Button>
          }
        >
          {adding && (
            <div className="anim-enter mb-2 flex flex-col gap-2 rounded border border-[var(--accent-line)] p-3">
              <TextArea
                rows={3}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={'One per line — each becomes a task'}
                aria-label="New action items"
              />
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void promote()} disabled={addItems.busy}>
                  {addItems.busy ? 'Creating…' : 'Create tasks'}
                </Button>
                <Button variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-faint)]">
              Nothing came out of this one — or it has not been written down yet.
            </p>
          ) : (
            <ul className="overflow-hidden rounded border border-line">
              {items.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-3 border-b border-line px-3 py-[7px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                  >
                    <StatusIndicator signal={TASK_STATUS[task.status]} />
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate text-[12.5px]',
                        task.status === 'DONE' && 'text-[var(--text-faint)] line-through',
                      )}
                    >
                      {task.title}
                    </span>
                    <Badge signal={PRIORITY[task.priority]}>{task.priority}</Badge>
                    <span className="mono w-[74px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                      {task.dueDate ? timeAgo(task.dueDate) : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {meeting.discussion && (
          <Section title="Discussion">
            <Markdown>{meeting.discussion}</Markdown>
          </Section>
        )}
      </div>
    </DetailShell>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="label">{title}</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
        {action}
      </div>
      {children}
    </section>
  );
}

function MeetingContext({ meeting }: { meeting: Meeting }) {
  const items = meeting.actionItems ?? [];
  const done = items.filter((task) => task.status === 'DONE').length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={meeting.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['When', new Date(meeting.meetingDate).toLocaleDateString()],
            ['Participants', String(meeting.participants.length)],
            [
              'Action items',
              items.length > 0 ? (
                <span className="flex items-center gap-[5px]">
                  <ListChecks size={11} /> {done}/{items.length} done
                </span>
              ) : (
                'None'
              ),
            ],
          ]}
        />
      </PanelSection>

      {meeting.participants.length > 0 && (
        <>
          <PanelDivider />
          <PanelSection title="Participants">
            <ul className="flex flex-col gap-[2px] text-[12px] text-[var(--text-muted)]">
              {meeting.participants.map((person) => (
                <li key={person}>{person}</li>
              ))}
            </ul>
          </PanelSection>
        </>
      )}

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={meeting.tags} href={(slug) => `/meetings?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={meeting.createdAt} updated={meeting.updatedAt} />
    </div>
  );
}
