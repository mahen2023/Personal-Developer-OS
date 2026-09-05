'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, GitCompareArrows } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Solution } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Button, LoadingLine } from '@/components/primitives';
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
import { SolutionEditor } from '../SolutionEditor';

export default function SolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: solution, loading, set } = useRecord<Solution>(`/solutions/${id}`);

  const markUsed = useAction(() => api<Solution>(`/solutions/${id}/used`, { method: 'POST' }));

  useContextPanel('Solution', solution ? <SolutionContext solution={solution} /> : null, [
    solution?.id,
    solution?.updatedAt,
    solution?.useCount,
  ]);

  if (loading && !solution) return <LoadingLine message="Loading solution…" />;
  if (!solution) return null;

  if (editing) {
    return (
      <SolutionEditor
        solution={solution}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <DetailShell
      title={solution.title}
      eyebrow="Solution"
      onEdit={() => setEditing(true)}
      deletePath={`/solutions/${id}`}
      deleteBackTo="/solutions"
      deleteConfirm={`Delete "${solution.title}"? The record of how you fixed this goes with it.`}
      actions={
        <Button
          disabled={markUsed.busy}
          onClick={async () => {
            const saved = await markUsed.run();
            if (saved) set(saved);
          }}
          title="Counts a reuse, so the solutions you actually reach for float to the top"
        >
          <Check size={13} /> Used it again
        </Button>
      }
      meta={
        <>
          {solution.environment && <span>{solution.environment}</span>}
          {solution.project && (
            <Link
              href={`/projects/${solution.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {solution.project.name}
            </Link>
          )}
          <span>reused {solution.useCount}×</span>
          <span>updated {timeAgo(solution.updatedAt)}</span>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Section title="Problem">
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">{solution.problem}</p>
        </Section>

        {solution.errorMessage && (
          <Section
            title="Error"
            action={<CopyButton value={solution.errorMessage} label="Copy error" />}
          >
            <pre className="mono overflow-x-auto rounded border border-line bg-[var(--surface-sunken)] px-3 py-2 text-[12px] leading-relaxed text-[var(--danger)]">
              {solution.errorMessage}
            </pre>
          </Section>
        )}

        {solution.rootCause && (
          <Section title="Root cause">
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
              {solution.rootCause}
            </p>
          </Section>
        )}

        <Section title="The fix">
          <Markdown>{solution.solution}</Markdown>
        </Section>

        {solution.commands.length > 0 && (
          <Section title="Commands">
            <ul className="flex flex-col gap-[6px]">
              {solution.commands.map((command) => (
                <li
                  key={command}
                  className="flex items-center gap-2 rounded border border-line bg-[var(--surface-sunken)] py-[5px] pl-3 pr-[6px]"
                >
                  <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre text-[12px]">
                    {command}
                  </code>
                  <CopyButton value={command} label="" className="shrink-0" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {solution.links.length > 0 && (
          <Section title="References">
            <ul className="flex flex-col gap-[3px]">
              {solution.links.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mono flex items-center gap-[6px] text-[12px] text-[var(--info)] hover:underline"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                </li>
              ))}
            </ul>
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

function SolutionContext({ solution }: { solution: Solution }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={solution.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Environment', solution.environment ?? '—'],
            ['Reused', `${solution.useCount}×`],
            ['Commands', String(solution.commands.length)],
          ]}
        />
      </PanelSection>

      {solution.related && solution.related.length > 0 && (
        <>
          <PanelDivider />
          <PanelSection title="Similar solutions">
            <ul className="flex flex-col gap-[4px]">
              {solution.related.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/solutions/${match.id}`}
                    className="flex items-start gap-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                  >
                    <GitCompareArrows
                      size={11}
                      className="mt-[3px] shrink-0 text-[var(--accent)]"
                    />
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
        <TagList tags={solution.tags} href={(slug) => `/solutions?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={undefined} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={solution.createdAt} updated={solution.updatedAt} />
    </div>
  );
}
