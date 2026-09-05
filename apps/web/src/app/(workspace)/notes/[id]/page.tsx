'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Pin, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import type { Note } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
import { NoteEditor } from '../NoteEditor';

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { data: note, loading, set } = useRecord<Note>(`/notes/${id}`);

  const remove = useAction(() => api(`/notes/${id}`, { method: 'DELETE' }));

  useContextPanel('Note', note ? <NoteContext note={note} /> : null, [note?.id, note?.updatedAt]);

  if (loading && !note) return <LoadingLine message="Loading note…" />;
  if (!note) return null;

  if (editing) {
    return (
      <NoteEditor
        note={note}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <article className="mx-auto max-w-[860px] px-6 pb-16 pt-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.015em]">
            {note.isPinned && <Pin size={14} className="shrink-0 text-[var(--accent)]" />}
            {note.title}
          </h1>
          <div className="mono mt-[6px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
            <Badge>{note.type}</Badge>
            {note.project && (
              <Link href={`/projects/${note.project.slug}`} className="hover:text-[var(--accent)]">
                {note.project.name}
              </Link>
            )}
            <span>updated {timeAgo(note.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </Button>
          <Button
            variant="danger"
            // Icon-only, so it needs a name of its own: without one the control
            // is unreachable by screen reader and unnameable by anything else.
            aria-label="Delete"
            disabled={remove.busy}
            onClick={async () => {
              if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
              await remove.run();
              router.push('/notes');
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </header>

      <Markdown>{note.content}</Markdown>
    </article>
  );
}

function NoteContext({ note }: { note: Note }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="label mb-[6px]">Filed under</div>
        {note.project ? (
          <Link
            href={`/projects/${note.project.slug}`}
            className="text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {note.project.name}
          </Link>
        ) : (
          <p className="text-[12px] text-[var(--text-faint)]">
            Unfiled. Edit the note to attach it to a project.
          </p>
        )}
      </div>

      {note.tags.length > 0 && (
        <>
          <div className="h-px bg-[var(--line)]" />
          <div>
            <div className="label mb-[6px]">Tags</div>
            <div className="flex flex-wrap gap-[4px]">
              {note.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/notes?tags=${tag.slug}`}
                  className="mono rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[11px] text-[var(--text-muted)] hover:border-[var(--accent-line)]"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="h-px bg-[var(--line)]" />
      <div>
        <div className="label mb-[6px]">References</div>
        {note.links.length === 0 ? (
          <p className="text-[12px] text-[var(--text-faint)]">
            Nothing linked yet. A note can point at a server, a deployment or another note.
          </p>
        ) : (
          <ul className="flex flex-col gap-[3px]">
            {note.links.map((link) => (
              <li key={`${link.type}-${link.id}`}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  <span className="truncate">{link.label}</span>
                  <span className="label shrink-0">{humanise(link.type)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="h-px bg-[var(--line)]" />
      <div className="mono flex flex-col gap-[3px] text-[11px] text-[var(--text-faint)]">
        <span>created {timeAgo(note.createdAt)}</span>
        <span>updated {timeAgo(note.updatedAt)}</span>
        <span>{note.content.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
