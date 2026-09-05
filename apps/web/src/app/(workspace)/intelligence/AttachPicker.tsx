'use client';

import { useEffect, useState } from 'react';
import { Paperclip, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { sourceLabel } from '@/lib/intelligence';

interface SearchHit {
  type: string;
  id: string;
  title: string;
  detail?: string;
  href: string;
}

/**
 * Attaching a specific record to a conversation (§17).
 *
 * Retrieval decides what is relevant per question; this is how you overrule it.
 * An attached record is sent every turn, in full, ahead of anything retrieved —
 * which is the point when you already know the note that matters and do not
 * want to hope the search finds it.
 *
 * It searches the same index the rest of the workspace does, so what you can
 * find here is exactly what you can find in global search. Vault items are not
 * searchable and so cannot be attached, which is not an accident (§42).
 */
export function AttachPicker({
  attached,
  onAttach,
  onClose,
}: {
  attached: string[];
  onAttach: (ref: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    // Debounced: a keystroke is not a query, and this hits the same endpoint
    // the command palette does.
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const result = await api<{ items?: SearchHit[] } | SearchHit[]>(
        `/search?q=${encodeURIComponent(term)}&limit=12`,
      ).catch(() => null);
      setHits(Array.isArray(result) ? result : (result?.items ?? []));
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Add context"
      className="anim-overlay fixed inset-0 z-50 flex items-start justify-center bg-[rgb(0_0_0/0.55)] pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="anim-palette w-full max-w-[520px] overflow-hidden rounded-lg bg-[var(--surface-overlay)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="label flex items-center gap-2 border-b border-line px-4 py-[9px]">
          <Paperclip size={12} /> Add context
        </div>

        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={12} className="shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a note, solution, ADR, document…"
            className="h-[36px] w-full bg-transparent text-[12.5px] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>

        {hits.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--text-faint)]">
            {query.trim().length < 2
              ? 'Type to search your workspace. What you attach is sent with every question in this conversation.'
              : searching
                ? 'Searching…'
                : 'Nothing matches.'}
          </p>
        ) : (
          <ul className="max-h-[46vh] overflow-y-auto">
            {hits.map((hit) => {
              const ref = `${hit.type}:${hit.id}`;
              const already = attached.includes(ref);
              return (
                <li key={ref}>
                  <button
                    disabled={already}
                    onClick={() => {
                      onAttach(ref);
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 border-b border-line px-4 py-[8px] text-left transition-colors last:border-b-0 hover:bg-[var(--surface-hover)] disabled:opacity-45"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{hit.title}</span>
                    <span className="mono shrink-0 text-[10.5px] text-[var(--text-faint)]">
                      {already ? 'attached' : sourceLabel(hit.type)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
