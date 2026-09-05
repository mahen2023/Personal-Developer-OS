'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/format';
import { IDEA_STATUS, PRIORITY, humanise } from '@/lib/domain';
import type { Idea } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, LoadingLine, StatusIndicator } from '@/components/primitives';
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
import { IdeaEditor } from '../IdeaEditor';

export default function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: idea, loading, set } = useRecord<Idea>(`/ideas/${id}`);

  useContextPanel('Idea', idea ? <IdeaContext idea={idea} /> : null, [idea?.id, idea?.updatedAt]);

  if (loading && !idea) return <LoadingLine message="Loading idea…" />;
  if (!idea) return null;

  if (editing) {
    return (
      <IdeaEditor
        idea={idea}
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
      title={idea.title}
      eyebrow="Idea"
      width="720px"
      onEdit={() => setEditing(true)}
      deletePath={`/ideas/${id}`}
      deleteBackTo="/ideas"
      deleteConfirm={`Discard "${idea.title}"?`}
      meta={
        <>
          <StatusIndicator signal={IDEA_STATUS[idea.status]} label={humanise(idea.status)} />
          <Badge signal={PRIORITY[idea.priority]}>{idea.priority}</Badge>
          {idea.category && <span>{idea.category}</span>}
          {idea.project && (
            <Link href={`/projects/${idea.project.slug}`} className="hover:text-[var(--accent)]">
              {idea.project.name}
            </Link>
          )}
        </>
      }
    >
      {idea.description ? (
        <Markdown>{idea.description}</Markdown>
      ) : (
        <p className="text-[12.5px] italic text-[var(--text-faint)]">
          Just the title so far. That is often enough.
        </p>
      )}
    </DetailShell>
  );
}

function IdeaContext({ idea }: { idea: Idea }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={idea.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Status', humanise(idea.status)],
            ['Priority', humanise(idea.priority)],
            ['Category', idea.category ?? '—'],
            ['Age', timeAgo(idea.createdAt)],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={idea.tags} href={(slug) => `/ideas?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={idea.createdAt} updated={idea.updatedAt} />
    </div>
  );
}
