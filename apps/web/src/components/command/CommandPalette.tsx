'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Plus, Search, type LucideIcon } from 'lucide-react';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { cx } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { api } from '@/lib/api';
import type { SearchResults } from '@/lib/types';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { KeyHint } from '@/components/primitives';

interface Command {
  id: string;
  label: string;
  group: string;
  icon?: LucideIcon;
  hint?: string;
  detail?: string;
  href: string;
}

/**
 * Create-actions (§8). They are destinations rather than modals so a half-typed
 * new record survives a refresh, and so every one of them is deep-linkable.
 */
const ACTIONS: Command[] = [
  ['Create Project', '/projects/new'],
  ['Create Note', '/notes/new'],
  ['Create Task', '/tasks/new'],
  ['Add Repository', '/repositories/new'],
  ['Add Server', '/servers/new'],
  ['Add Database', '/databases/new'],
  ['Add Environment', '/environments/new'],
  ['Add Domain', '/domains/new'],
  ['Add Certificate', '/certificates/new'],
  ['Record Deployment', '/deployments/new'],
  ['Add Secret', '/vault/new'],
  ['Create Solution', '/solutions/new'],
  ['Create Snippet', '/snippets/new'],
  ['Save Command', '/commands/new'],
  ['Create ADR', '/adrs/new'],
  ['Record Meeting', '/meetings/new'],
  ['Capture Idea', '/ideas/new'],
  ['Add Bookmark', '/bookmarks/new'],
  ['Upload Document', '/documents'],
  ['Ask the console', '/intelligence'],
].map(([label, href]) => ({
  id: `action:${href}`,
  label,
  group: 'Actions',
  icon: Plus,
  hint: href,
  href,
}));

const DESTINATIONS: Command[] = ALL_NAV_ITEMS.map((item) => ({
  id: `go:${item.href}`,
  label: item.label,
  group: 'Go to',
  icon: item.icon,
  hint: item.chord ? `g ${item.chord}` : undefined,
  href: item.href,
}));

/**
 * Subsequence match with a bias toward word starts, so "adom" finds
 * "Add Domain" and "cp" finds "Create Project" without a fuzzy library.
 * Returns null when the query does not match at all.
 */
export function score(text: string, query: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  let position = 0;
  let total = 0;

  for (const character of query.toLowerCase()) {
    const index = haystack.indexOf(character, position);
    if (index === -1) return null;
    const atWordStart = index === 0 || haystack[index - 1] === ' ' || haystack[index - 1] === '/';
    total += atWordStart ? 12 : 4;
    // Consecutive characters beat scattered ones.
    if (index === position) total += 6;
    position = index + 1;
  }
  // Shorter labels win when the score ties.
  return total - haystack.length * 0.1;
}

/** Wait this long after the last keystroke before asking the server. */
const SEARCH_DEBOUNCE_MS = 160;

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [records, setRecords] = useState<Command[]>([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // `>` switches to actions-only, the convention every developer already knows.
  const actionMode = query.startsWith('>');
  const term = actionMode ? query.slice(1).trim() : query.trim();

  // Local commands answer instantly; the server fills in real records behind
  // them. Typing never waits on the network.
  useEffect(() => {
    if (actionMode || term.length < 2) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<SearchResults>(`/search?q=${encodeURIComponent(term)}&limit=24`)
        .then((results) => {
          if (cancelled) return;
          setRecords(
            results.groups.flatMap((group) =>
              group.hits.map((hit) => ({
                id: `${hit.type}:${hit.id}`,
                label: hit.title,
                group: humanise(hit.type),
                detail: hit.snippet,
                hint: hit.detail ? humanise(hit.detail) : undefined,
                href: hit.href,
              })),
            ),
          );
        })
        .catch(() => !cancelled && setRecords([]))
        .finally(() => !cancelled && setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, actionMode]);

  const local = useMemo(() => {
    const pool = actionMode ? ACTIONS : [...ACTIONS, ...DESTINATIONS];
    return pool
      .map((command) => ({ command, rank: score(command.label, term) }))
      .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, actionMode ? 40 : 8)
      .map((entry) => entry.command);
  }, [term, actionMode]);

  const results = useMemo(() => [...records, ...local], [records, local]);

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of results) {
      map.set(command.group, [...(map.get(command.group) ?? []), command]);
    }
    return [...map.entries()];
  }, [results]);

  useEffect(() => setSelected(0), [term, actionMode]);

  useEffect(() => {
    if (!paletteOpen) {
      setQuery('');
      setRecords([]);
    }
  }, [paletteOpen]);

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, results.length]);

  if (!paletteOpen) return null;

  function open(command: Command) {
    setPaletteOpen(false);
    router.push(command.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault();
      setSelected((current) => (current + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault();
      setSelected((current) => (current - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[selected];
      if (command) open(command);
      else if (term) {
        // No hit yet — hand the query to the full search page rather than
        // swallowing the keystroke.
        setPaletteOpen(false);
        router.push(`/search?q=${encodeURIComponent(term)}`);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setPaletteOpen(false);
    }
  }

  let index = -1;

  return (
    <div
      className="anim-overlay fixed inset-0 z-50 flex items-start justify-center bg-[rgb(0_0_0/0.55)] pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && setPaletteOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="anim-palette flex max-h-[64vh] w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-[var(--surface-overlay)]"
        style={{ boxShadow: 'var(--shadow-overlay)' }}
      >
        <div className="flex shrink-0 items-center gap-[10px] border-b border-line px-[14px]">
          <Search size={14} className="shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything, or type > for actions…"
            aria-label="Search everything, or type > for actions"
            className="h-[44px] flex-1 bg-transparent text-[13.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {searching && (
            <span
              aria-label="Searching"
              className="h-[6px] w-[6px] rounded-full bg-[var(--accent)]"
              style={{ animation: 'pulse-ring 1.4s var(--ease) infinite', color: 'var(--accent)' }}
            />
          )}
          <KeyHint keys={['esc']} />
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {groups.length === 0 ? (
            <p className="px-[14px] py-6 text-[12.5px] text-[var(--text-faint)]">
              {term ? (
                <>
                  Nothing matches <span className="mono text-[var(--text-muted)]">{term}</span>.
                  Press <span className="mono">↵</span> to open the full search.
                </>
              ) : (
                'Start typing to search projects, notes, solutions and infrastructure.'
              )}
            </p>
          ) : (
            groups.map(([group, commands]) => (
              <div key={group} className="mb-1">
                <div className="label px-[14px] py-[5px]">{group}</div>
                {commands.map((command) => {
                  index += 1;
                  const isSelected = index === selected;
                  const position = index;
                  const Icon = command.icon;
                  return (
                    <button
                      key={command.id}
                      data-selected={isSelected}
                      onMouseMove={() => setSelected(position)}
                      onClick={() => open(command)}
                      className={cx(
                        'flex w-full items-center gap-[10px] px-[14px] py-[6px] text-left transition-colors duration-[var(--fast)]',
                        isSelected
                          ? 'bg-[var(--surface-active)]'
                          : 'hover:bg-[var(--surface-hover)]',
                      )}
                    >
                      {Icon && (
                        <Icon
                          size={14}
                          className={cx(
                            'shrink-0',
                            isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]',
                          )}
                        />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12.5px]">{command.label}</span>
                        {command.detail && (
                          <span className="truncate text-[11px] text-[var(--text-faint)]">
                            {command.detail}
                          </span>
                        )}
                      </span>
                      {command.hint && (
                        <span className="mono shrink-0 text-[11px] text-[var(--text-faint)]">
                          {command.hint}
                        </span>
                      )}
                      {isSelected && (
                        <CornerDownLeft size={12} className="shrink-0 text-[var(--text-faint)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="mono flex shrink-0 items-center gap-4 border-t border-line px-[14px] py-[7px] text-[11px] text-[var(--text-faint)]">
          <span className="flex items-center gap-[6px]">
            <KeyHint keys={['↑', '↓']} /> navigate
          </span>
          <span className="flex items-center gap-[6px]">
            <KeyHint keys={['↵']} /> open
          </span>
          <span className="ml-auto flex items-center gap-[6px]">
            <KeyHint keys={['>']} /> actions
          </span>
        </div>
      </div>
    </div>
  );
}
