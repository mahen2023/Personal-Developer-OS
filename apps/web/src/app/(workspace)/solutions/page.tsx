'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CircuitBoard, Plus, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { Solution, SolutionMatch } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState, LoadingLine } from '@/components/primitives';
import {
  type Column,
  DataTable,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { MonoCell, ProjectCell, TimeCell } from '@/components/patterns/DetailShell';
import { TextArea } from '@/components/patterns/Form';

export default function SolutionsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Solution>('/solutions', queryString);

  const columns: Column<Solution>[] = [
    {
      key: 'title',
      header: 'Solution',
      render: (solution) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="truncate text-[12.5px]">{solution.title}</span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">
            {solution.errorMessage || solution.problem}
          </span>
        </span>
      ),
    },
    {
      key: 'environment',
      header: 'Environment',
      width: '170px',
      hideBelow: 'lg',
      render: (solution) => <MonoCell value={solution.environment} />,
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (solution) => <ProjectCell project={solution.project} />,
    },
    {
      key: 'used',
      header: 'Reused',
      width: '62px',
      align: 'right',
      hideBelow: 'sm',
      render: (solution) => (
        <span className="num text-[11px] text-[var(--text-faint)]">{solution.useCount}×</span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (solution) => <TimeCell value={solution.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={CircuitBoard}
        title="Solutions"
        subtitle="How you fixed it last time, in a form you can find again."
        count={data?.total}
        actions={
          <Link href="/solutions/new">
            <Button variant="primary">
              <Plus size={13} /> New solution
            </Button>
          </Link>
        }
      />

      <HaveISolvedThis />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search problems, errors, root causes and fixes…"
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(solution) => `/solutions/${solution.id}`}
        empty={
          <EmptyState
            icon={CircuitBoard}
            title={values.q ? 'Nothing matches' : 'No solutions recorded yet'}
            description={
              values.q
                ? 'No solution matches that search.'
                : 'Every time you work something out, record it here. The next time the same error appears, paste it above and this page finds the fix.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'the problem, and the exact error text',
                    'the environment it happened in',
                    'the root cause and the commands that fixed it',
                  ]
            }
            action={
              <Link href="/solutions/new">
                <Button variant="primary">
                  <Plus size={13} /> Record a solution
                </Button>
              </Link>
            }
          />
        }
      />

      {data && (
        <Pager
          page={data.page}
          pages={data.pages}
          total={data.total}
          onChange={(page) => set({ page: String(page) })}
        />
      )}
    </div>
  );
}

/**
 * The question this module exists to answer (§14). Pasting a raw error is the
 * natural gesture, so it gets its own control rather than being hidden behind
 * the generic filter box — a stack trace is not a search term.
 */
function HaveISolvedThis() {
  const [text, setText] = useState('');
  const [matches, setMatches] = useState<SolutionMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (text.trim().length < 3) return;
    setBusy(true);
    const found = await api<SolutionMatch[]>('/solutions/similar', {
      method: 'POST',
      body: { text },
    }).catch(() => []);
    setMatches(found);
    setBusy(false);
  }

  return (
    <section className="mb-4 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        <Sparkles size={11} className="text-[var(--accent)]" />
        Have I solved this before?
      </div>

      <div className="flex flex-col gap-2 p-3">
        <TextArea
          rows={2}
          mono
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter submits; plain Enter keeps the newlines a pasted
            // stack trace needs.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void ask();
          }}
          placeholder="Paste an error message or describe the symptom…"
          aria-label="Paste an error message"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={() => void ask()}
            disabled={busy || text.trim().length < 3}
          >
            {busy ? 'Looking…' : 'Search my solutions'}
          </Button>
          {matches !== null && (
            <button
              onClick={() => {
                setMatches(null);
                setText('');
              }}
              className="text-[11.5px] text-[var(--text-faint)] underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
          <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">⌘↵ to search</span>
        </div>
      </div>

      {busy && <LoadingLine message="Matching against your own fixes…" />}

      {matches !== null && !busy && (
        <div className="border-t border-line">
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-[12.5px] text-[var(--text-faint)]">
              Nothing similar on record. If you work this one out,{' '}
              <Link href="/solutions/new" className="text-[var(--accent)] hover:underline">
                write it down
              </Link>{' '}
              — that is what makes the next time faster.
            </p>
          ) : (
            <ul className="stagger">
              {matches.map((match) => (
                <li key={match.id}>
                  <Link
                    href={`/solutions/${match.id}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-[8px] transition-colors duration-[var(--fast)] last:border-b-0 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="num w-[34px] shrink-0 text-[11px] text-[var(--accent)]">
                      {Math.min(99, match.score)}%
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{match.title}</span>
                    <span className="mono hidden shrink-0 text-[11px] text-[var(--text-faint)] md:inline">
                      matched on {match.reason}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
