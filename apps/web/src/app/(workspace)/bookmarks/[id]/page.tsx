'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { humanise } from '@/lib/domain';
import type { Bookmark } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CopyButton } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { BookmarkEditor } from '../BookmarkEditor';

export default function BookmarkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: bookmark, loading, set } = useRecord<Bookmark>(`/bookmarks/${id}`);

  useContextPanel('Bookmark', bookmark ? <BookmarkContext bookmark={bookmark} /> : null, [
    bookmark?.id,
    bookmark?.updatedAt,
  ]);

  if (loading && !bookmark) return <LoadingLine message="Loading bookmark…" />;
  if (!bookmark) return null;

  if (editing) {
    return (
      <BookmarkEditor
        bookmark={bookmark}
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
      title={bookmark.title}
      eyebrow="Bookmark"
      width="720px"
      onEdit={() => setEditing(true)}
      deletePath={`/bookmarks/${id}`}
      deleteBackTo="/bookmarks"
      deleteConfirm={`Remove "${bookmark.title}"?`}
      meta={
        <>
          <Badge>{bookmark.category}</Badge>
          {bookmark.project && (
            <Link
              href={`/projects/${bookmark.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {bookmark.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded border border-line bg-[var(--surface-raised)] px-3 py-[9px]">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mono flex min-w-0 flex-1 items-center gap-[6px] text-[12.5px] text-[var(--info)] hover:underline"
          >
            <span className="truncate">{bookmark.url}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
          <CopyButton value={bookmark.url} label="" />
        </div>

        {bookmark.description && (
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            {bookmark.description}
          </p>
        )}
      </div>
    </DetailShell>
  );
}

function BookmarkContext({ bookmark }: { bookmark: Bookmark }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={bookmark.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList rows={[['Category', humanise(bookmark.category)]]} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={bookmark.tags} href={(slug) => `/bookmarks?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={bookmark.createdAt} updated={bookmark.updatedAt} />
    </div>
  );
}
