'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { CircuitBoard, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { ISSUE_STATUS, PRIORITY, humanise } from '@/lib/domain';
import type { Issue, SolutionMatch } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CopyButton, Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  LinkedRecords,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { Field, FormError, TextArea, TextInput } from '@/components/patterns/Form';
import { IssueEditor } from '../IssueEditor';

type IssueDetail = Issue & { suggestions?: SolutionMatch[]; links?: never[] };

export default function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const { data: issue, loading, set } = useRecord<IssueDetail>(`/issues/${id}`);

  useContextPanel('Issue', issue ? <IssueContext issue={issue} /> : null, [
    issue?.id,
    issue?.updatedAt,
  ]);

  if (loading && !issue) return <LoadingLine message="Loading issue…" />;
  if (!issue) return null;

  if (editing) {
    return (
      <IssueEditor
        issue={issue}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved as IssueDetail);
          setEditing(false);
        }}
      />
    );
  }

  const resolved = Boolean(issue.solutionId);

  return (
    <DetailShell
      title={issue.title}
      eyebrow="Issue"
      onEdit={() => setEditing(true)}
      deletePath={`/issues/${id}`}
      deleteBackTo="/issues"
      deleteConfirm={`Delete "${issue.title}"?`}
      actions={
        !resolved && (
          <Button variant="primary" onClick={() => setResolving((open) => !open)}>
            <CircuitBoard size={13} /> {resolving ? 'Close panel' : 'Resolve'}
          </Button>
        )
      }
      meta={
        <>
          <StatusIndicator signal={ISSUE_STATUS[issue.status]} label={humanise(issue.status)} />
          <Badge signal={PRIORITY[issue.priority]}>{issue.priority}</Badge>
          {issue.project && (
            <Link href={`/projects/${issue.project.slug}`} className="hover:text-[var(--accent)]">
              {issue.project.name}
            </Link>
          )}
          <span>updated {timeAgo(issue.updatedAt)}</span>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {resolving && !resolved && (
          <ResolvePanel
            issue={issue}
            onResolved={(saved) => {
              set(saved);
              setResolving(false);
            }}
          />
        )}

        {resolved && issue.solution && (
          <div className="flex items-center gap-3 rounded border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[var(--success-dim)] px-4 py-3">
            <CircuitBoard size={14} className="shrink-0 text-[var(--success)]" />
            <div className="min-w-0">
              <div className="text-[12.5px]">
                Resolved{issue.resolvedAt ? ` ${timeAgo(issue.resolvedAt)}` : ''} by{' '}
                <Link
                  href={`/solutions/${issue.solution.id}`}
                  className="text-[var(--success)] underline-offset-2 hover:underline"
                >
                  {issue.solution.title}
                </Link>
              </div>
              <div className="mono text-[11px] text-[var(--text-faint)]">
                that solution has now been used {issue.solution.useCount ?? 1}×
              </div>
            </div>
          </div>
        )}

        {issue.errorMessage && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="label">Error</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
              <CopyButton value={issue.errorMessage} label="Copy error" />
            </div>
            <pre className="mono overflow-x-auto rounded border border-line bg-[var(--surface-sunken)] px-3 py-2 text-[12px] leading-relaxed text-[var(--danger)]">
              {issue.errorMessage}
            </pre>
          </section>
        )}

        {issue.description ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <span className="label">Description</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <Markdown>{issue.description}</Markdown>
          </section>
        ) : (
          <p className="text-[12.5px] italic text-[var(--text-faint)]">No description.</p>
        )}
      </div>
    </DetailShell>
  );
}

/**
 * Resolving is where the knowledge gets captured, so it offers both paths in
 * one place: link the solution you already have, or write the new one now.
 */
function ResolvePanel({
  issue,
  onResolved,
}: {
  issue: IssueDetail;
  onResolved: (issue: IssueDetail) => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    issue.suggestions && issue.suggestions.length > 0 ? 'existing' : 'new',
  );
  const [chosen, setChosen] = useState(issue.suggestions?.[0]?.id ?? '');
  const [draft, setDraft] = useState({
    title: issue.title,
    rootCause: '',
    solution: '',
    environment: '',
    commands: '',
  });

  const resolve = useAction((body: Record<string, unknown>) =>
    api<IssueDetail>(`/issues/${issue.id}/resolve`, { method: 'POST', body }),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body =
      mode === 'existing'
        ? { solutionId: chosen }
        : {
            solution: {
              title: draft.title,
              problem: issue.description ?? issue.title,
              errorMessage: issue.errorMessage ?? undefined,
              environment: draft.environment || undefined,
              rootCause: draft.rootCause || undefined,
              solution: draft.solution,
              commands: draft.commands
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            },
          };
    const saved = await resolve.run(body);
    if (saved) onResolved(saved);
  }

  return (
    <form
      onSubmit={submit}
      className="anim-enter overflow-hidden rounded border border-[var(--accent-line)] bg-[var(--surface-raised)]"
    >
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        Resolve this issue
      </div>

      <div className="flex flex-col gap-3 p-4">
        <FormError error={resolve.error} />

        <div className="flex gap-1">
          <ModeTab active={mode === 'existing'} onClick={() => setMode('existing')}>
            Link an existing solution
          </ModeTab>
          <ModeTab active={mode === 'new'} onClick={() => setMode('new')}>
            Write the fix now
          </ModeTab>
        </div>

        {mode === 'existing' ? (
          issue.suggestions && issue.suggestions.length > 0 ? (
            <ul className="flex flex-col gap-[2px]">
              {issue.suggestions.map((match) => (
                <li key={match.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded border border-line px-3 py-2 transition-colors hover:border-[var(--line-strong)]">
                    <input
                      type="radio"
                      name="solution"
                      checked={chosen === match.id}
                      onChange={() => setChosen(match.id)}
                      className="accent-[var(--accent)]"
                    />
                    <Sparkles size={11} className="shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{match.title}</span>
                    <span className="num shrink-0 text-[11px] text-[var(--text-faint)]">
                      {Math.min(99, match.score)}%
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-[var(--text-faint)]">
              Nothing similar on record. Write the fix instead — that is what makes the next one
              faster.
            </p>
          )
        ) : (
          <>
            <Field label="Title">
              <TextInput
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
              />
            </Field>
            <Field label="Environment">
              <TextInput
                value={draft.environment}
                onChange={(event) => setDraft({ ...draft, environment: event.target.value })}
                placeholder="Docker · nginx 1.27"
              />
            </Field>
            <Field label="Root cause">
              <TextArea
                rows={2}
                value={draft.rootCause}
                onChange={(event) => setDraft({ ...draft, rootCause: event.target.value })}
              />
            </Field>
            <Field label="The fix">
              <TextArea
                rows={4}
                required
                value={draft.solution}
                onChange={(event) => setDraft({ ...draft, solution: event.target.value })}
              />
            </Field>
            <Field label="Commands" hint="One per line.">
              <TextArea
                rows={2}
                mono
                value={draft.commands}
                onChange={(event) => setDraft({ ...draft, commands: event.target.value })}
              />
            </Field>
          </>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={
            resolve.busy ||
            (mode === 'existing' ? !chosen : !draft.solution.trim() || !draft.title.trim())
          }
        >
          {resolve.busy ? 'Resolving…' : 'Resolve and record'}
        </Button>
      </div>
    </form>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[9px] py-[4px] text-[12px] text-[var(--accent)]'
          : 'rounded border border-line px-[9px] py-[4px] text-[12px] text-[var(--text-muted)] hover:border-[var(--line-strong)]'
      }
    >
      {children}
    </button>
  );
}

function IssueContext({ issue }: { issue: IssueDetail }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={issue.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Status', humanise(issue.status)],
            ['Priority', humanise(issue.priority)],
            ['Resolved', issue.resolvedAt ? timeAgo(issue.resolvedAt) : 'Not yet'],
          ]}
        />
      </PanelSection>

      {!issue.solutionId && issue.suggestions && issue.suggestions.length > 0 && (
        <>
          <PanelDivider />
          <PanelSection title="Have you seen this before?">
            <ul className="flex flex-col gap-[4px]">
              {issue.suggestions.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/solutions/${match.id}`}
                    className="flex items-start gap-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                  >
                    <Sparkles size={11} className="mt-[3px] shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="block truncate">{match.title}</span>
                      <span className="mono block truncate text-[10.5px] text-[var(--text-faint)]">
                        {match.reason}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </PanelSection>
        </>
      )}

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={issue.tags} href={(slug) => `/issues?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={issue.links} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={issue.createdAt} updated={issue.updatedAt} />
    </div>
  );
}
