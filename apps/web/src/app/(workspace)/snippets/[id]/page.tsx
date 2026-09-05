'use client';

import { use, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Snippet } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CodeViewer } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { SnippetEditor } from '../SnippetEditor';

export default function SnippetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: snippet, loading, set } = useRecord<Snippet>(`/snippets/${id}`);

  const markUsed = useAction(() => api<Snippet>(`/snippets/${id}/used`, { method: 'POST' }));

  useContextPanel('Snippet', snippet ? <SnippetContext snippet={snippet} /> : null, [
    snippet?.id,
    snippet?.updatedAt,
    snippet?.useCount,
  ]);

  if (loading && !snippet) return <LoadingLine message="Loading snippet…" />;
  if (!snippet) return null;

  if (editing) {
    return (
      <SnippetEditor
        snippet={snippet}
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
      title={snippet.title}
      eyebrow={`Snippet · ${snippet.language}`}
      onEdit={() => setEditing(true)}
      deletePath={`/snippets/${id}`}
      deleteBackTo="/snippets"
      deleteConfirm={`Delete "${snippet.title}"?`}
      meta={
        <>
          {snippet.description && <span>{snippet.description}</span>}
          <span>copied {snippet.useCount}×</span>
          <span>updated {timeAgo(snippet.updatedAt)}</span>
        </>
      }
    >
      <div onCopyCapture={() => void markUsed.run().then((saved) => saved && set(saved))}>
        <CodeViewer code={snippet.code} language={snippet.language} maxHeight="none" />
      </div>
    </DetailShell>
  );
}

function SnippetContext({ snippet }: { snippet: Snippet }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={snippet.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Language', snippet.language],
            ['Lines', String(snippet.code.split('\n').length)],
            ['Copied', `${snippet.useCount}×`],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={snippet.tags} href={(slug) => `/snippets?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={snippet.createdAt} updated={snippet.updatedAt} />
    </div>
  );
}
