'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { ADR_STATUS, adrNumber, humanise } from '@/lib/domain';
import type { Adr } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
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
import { AdrEditor } from '../AdrEditor';

type AdrDetail = Adr & {
  supersededByAdr?: { id: string; number: number; title: string; status: string } | null;
  supersedes?: { id: string; number: number; title: string; status: string }[];
};

export default function AdrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: adr, loading, set } = useRecord<AdrDetail>(`/adrs/${id}`);

  useContextPanel('Decision', adr ? <AdrContext adr={adr} /> : null, [adr?.id, adr?.updatedAt]);

  if (loading && !adr) return <LoadingLine message="Loading decision record…" />;
  if (!adr) return null;

  if (editing) {
    return (
      <AdrEditor
        adr={adr}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved as AdrDetail);
          setEditing(false);
        }}
      />
    );
  }

  const retired = adr.status === 'SUPERSEDED' || adr.status === 'DEPRECATED';

  return (
    <DetailShell
      title={adr.title}
      eyebrow={adrNumber(adr.number)}
      onEdit={() => setEditing(true)}
      deletePath={`/adrs/${id}`}
      deleteBackTo="/adrs"
      deleteConfirm={`Delete ${adrNumber(adr.number)}? The number will not be reused.`}
      meta={
        <>
          <StatusIndicator signal={ADR_STATUS[adr.status]} label={humanise(adr.status)} />
          {adr.project && (
            <Link href={`/projects/${adr.project.slug}`} className="hover:text-[var(--accent)]">
              {adr.project.name}
            </Link>
          )}
          {adr.decidedAt && <span>decided {timeAgo(adr.decidedAt)}</span>}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {retired && adr.supersededByAdr && (
          <p className="flex items-center gap-2 rounded border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)] px-3 py-2 text-[12.5px]">
            <ArrowRight size={13} className="shrink-0 text-[var(--warning)]" />
            Superseded by{' '}
            <Link
              href={`/adrs/${adr.supersededByAdr.id}`}
              className="text-[var(--warning)] underline-offset-2 hover:underline"
            >
              {adrNumber(adr.supersededByAdr.number)} — {adr.supersededByAdr.title}
            </Link>
          </p>
        )}

        {adr.supersedes && adr.supersedes.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 rounded border border-line bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] text-[var(--text-muted)]">
            <ArrowLeft size={13} className="shrink-0 text-[var(--text-faint)]" />
            Replaces{' '}
            {adr.supersedes.map((previous, index) => (
              <span key={previous.id}>
                {index > 0 && ', '}
                <Link href={`/adrs/${previous.id}`} className="hover:text-[var(--accent)]">
                  {adrNumber(previous.number)}
                </Link>
              </span>
            ))}
          </p>
        )}

        <Section title="Context">
          <Markdown>{adr.context}</Markdown>
        </Section>

        <Section title="Decision">
          <Markdown>{adr.decision}</Markdown>
        </Section>

        {adr.alternatives && (
          <Section title="Alternatives considered">
            <Markdown>{adr.alternatives}</Markdown>
          </Section>
        )}

        {adr.consequences && (
          <Section title="Consequences">
            <Markdown>{adr.consequences}</Markdown>
          </Section>
        )}
      </div>
    </DetailShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="label">{title}</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
      {children}
    </section>
  );
}

function AdrContext({ adr }: { adr: AdrDetail }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={adr.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Record">
        <DefinitionList
          rows={[
            ['Number', adrNumber(adr.number)],
            ['Status', humanise(adr.status)],
            ['Decided', adr.decidedAt ? timeAgo(adr.decidedAt) : 'Not yet'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Chain">
        {adr.supersededByAdr ? (
          <Link
            href={`/adrs/${adr.supersededByAdr.id}`}
            className="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            → {adrNumber(adr.supersededByAdr.number)} {adr.supersededByAdr.title}
          </Link>
        ) : adr.supersedes && adr.supersedes.length > 0 ? (
          <ul className="flex flex-col gap-[3px]">
            {adr.supersedes.map((previous) => (
              <li key={previous.id}>
                <Link
                  href={`/adrs/${previous.id}`}
                  className="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  ← {adrNumber(previous.number)} {previous.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-faint)]">
            This decision still stands on its own.
          </p>
        )}
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={adr.tags} href={(slug) => `/adrs?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={undefined} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={adr.createdAt} updated={adr.updatedAt} />
    </div>
  );
}
