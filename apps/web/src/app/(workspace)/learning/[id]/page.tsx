'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { LEARNING_STATUS, humanise } from '@/lib/domain';
import type { LearningItem } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { LoadingLine, ProgressBar, StatusIndicator } from '@/components/primitives';
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
import { LearningEditor } from '../LearningEditor';

export default function LearningItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: item, loading, set } = useRecord<LearningItem>(`/learning/${id}`);

  useContextPanel('Learning', item ? <LearningContext item={item} /> : null, [
    item?.id,
    item?.updatedAt,
  ]);

  if (loading && !item) return <LoadingLine message="Loading…" />;
  if (!item) return null;

  if (editing) {
    return (
      <LearningEditor
        item={item}
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
      title={item.title}
      eyebrow={humanise(item.kind)}
      width="720px"
      onEdit={() => setEditing(true)}
      deletePath={`/learning/${id}`}
      deleteBackTo="/learning"
      deleteConfirm={`Remove "${item.title}" from the list?`}
      meta={
        <>
          <StatusIndicator signal={LEARNING_STATUS[item.status]} label={humanise(item.status)} />
          {item.technology && <span>{item.technology}</span>}
          {item.project && (
            <Link href={`/projects/${item.project.slug}`} className="hover:text-[var(--accent)]">
              {item.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="max-w-[320px]">
          <ProgressBar value={item.progress} />
        </div>

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mono flex items-center gap-[6px] text-[12.5px] text-[var(--info)] hover:underline"
          >
            <span className="truncate">{item.url}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        )}

        {item.notes ? (
          <Markdown>{item.notes}</Markdown>
        ) : (
          <p className="text-[12.5px] italic text-[var(--text-faint)]">No notes yet.</p>
        )}
      </div>
    </DetailShell>
  );
}

function LearningContext({ item }: { item: LearningItem }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={item.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Progress">
        <DefinitionList
          rows={[
            ['Status', humanise(item.status)],
            ['Complete', `${item.progress}%`],
            ['Started', item.startedAt ? timeAgo(item.startedAt) : 'Not yet'],
            ['Finished', item.finishedAt ? timeAgo(item.finishedAt) : '—'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={item.tags} href={(slug) => `/learning?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={item.createdAt} updated={item.updatedAt} />
    </div>
  );
}
