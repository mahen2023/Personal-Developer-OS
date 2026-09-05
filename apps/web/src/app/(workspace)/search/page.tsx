'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import type { SearchResults } from '@/lib/types';
import { useListQuery } from '@/hooks/useResource';
import { EmptyState, LoadingLine } from '@/components/primitives';
import { PageHeader, SearchField, Toolbar } from '@/components/patterns/PageShell';

/** Types offered as filters, in the order they matter most. */
const TYPES = [
  'PROJECT',
  'NOTE',
  'SOLUTION',
  'TASK',
  'ISSUE',
  'SERVER',
  'DATABASE',
  'ENVIRONMENT',
  'DOMAIN',
  'DEPLOYMENT',
  'REPOSITORY',
  'SNIPPET',
  'COMMAND',
  'ADR',
  'MEETING',
  'DOCUMENT',
  'BOOKMARK',
  'LEARNING',
  'IDEA',
  'VAULT_ITEM',
];

export default function SearchPage() {
  const { values, set, queryString } = useListQuery();
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = values.types ? values.types.split(',').filter(Boolean) : [];

  useEffect(() => {
    if (!values.q && !values.tags) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<SearchResults>(`/search?${queryString}`)
      .then((data) => !cancelled && setResults(data))
      .catch(() => !cancelled && setResults(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString, values.q, values.tags]);

  function toggleType(type: string) {
    const next = selected.includes(type)
      ? selected.filter((entry) => entry !== type)
      : [...selected, type];
    set({ types: next.length ? next.join(',') : undefined });
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <PageHeader
        icon={SearchIcon}
        title="Search"
        subtitle="One query across every module. Exact matching — the kind that finds an env var name."
        count={results?.total}
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search projects, notes, solutions, infrastructure, secrets…"
        />
      </Toolbar>

      <div className="mb-4 flex flex-wrap gap-[4px]">
        {TYPES.map((type) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            aria-pressed={selected.includes(type)}
            className={cx(
              'label rounded-sm border px-[6px] py-[2px] transition-colors duration-[var(--fast)]',
              selected.includes(type)
                ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'border-line text-[var(--text-faint)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)]',
            )}
          >
            {humanise(type)}
          </button>
        ))}
        {selected.length > 0 && (
          <button
            onClick={() => set({ types: undefined })}
            className="label px-[6px] py-[2px] text-[var(--text-faint)] underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {loading && !results && <LoadingLine message="Searching your knowledge base…" />}

      {!values.q && !values.tags && (
        <div className="rounded border border-line bg-[var(--surface-raised)]">
          <EmptyState
            icon={SearchIcon}
            title="Search everything"
            description="One box across every module. Results are grouped by type and ranked so exact title matches come first."
            connects={[
              'press ⌘K anywhere for the same search',
              'filter to a type with the chips above',
              'vault items match on name only, never on their secret',
            ]}
          />
        </div>
      )}

      {results && results.total === 0 && (
        <div className="rounded border border-line bg-[var(--surface-raised)]">
          <EmptyState
            icon={SearchIcon}
            title="Nothing found"
            description={`Nothing matches "${results.term}". Try a shorter term, or clear the type filters.`}
          />
        </div>
      )}

      {results && results.total > 0 && (
        <div className="stagger flex flex-col gap-4">
          {results.groups.map((group) => (
            <section
              key={group.type}
              className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]"
            >
              <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
                {humanise(group.type)}
                <span className="num text-[var(--text-faint)]">{group.hits.length}</span>
              </div>
              <ul>
                {group.hits.map((hit) => (
                  <li key={`${hit.type}-${hit.id}`}>
                    <Link
                      href={hit.href}
                      className="flex flex-col gap-[2px] border-b border-line px-4 py-[9px] transition-colors duration-[var(--fast)] last:border-b-0 hover:bg-[var(--surface-hover)]"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">{hit.title}</span>
                        {hit.detail && (
                          <span className="mono shrink-0 text-[11px] text-[var(--text-faint)]">
                            {humanise(hit.detail)}
                          </span>
                        )}
                        <span className="mono shrink-0 text-[11px] text-[var(--text-faint)]">
                          {timeAgo(hit.updatedAt)}
                        </span>
                      </span>
                      {hit.snippet && <Snippet text={hit.snippet} term={results.term} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Highlights the matched term inside the excerpt, without dangerous HTML. */
function Snippet({ text, term }: { text: string; term: string }) {
  if (!term) return <span className="text-[11.5px] text-[var(--text-faint)]">{text}</span>;

  const parts: React.ReactNode[] = [];
  const lowered = text.toLowerCase();
  const needle = term.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const at = lowered.indexOf(needle, cursor);
    if (at === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-[var(--accent-dim)] px-[1px] text-[var(--accent)]">
        {text.slice(at, at + term.length)}
      </mark>,
    );
    cursor = at + term.length;
  }

  return <span className="truncate text-[11.5px] text-[var(--text-faint)]">{parts}</span>;
}
