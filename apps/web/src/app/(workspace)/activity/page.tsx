'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity as ActivityIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { clockTime, dayLabel } from '@/lib/format';
import type { ActivityEntry, Paged } from '@/lib/types';
import { Button, EmptyState, Skeleton } from '@/components/primitives';

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (target: number) => {
    setLoading(true);
    const result = await api<Paged<ActivityEntry>>(
      `/activities?page=${target}&limit=${PAGE_SIZE}`,
    ).catch(() => null);
    if (result) {
      // Append rather than replace: this is a feed, not a table.
      setEntries((current) => (target === 1 ? result.items : [...current, ...result.items]));
      setPages(result.pages);
      setPage(result.page);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const empty = !loading && entries.length === 0;
  let currentDay = '';

  return (
    <div className="mx-auto max-w-[820px] px-6 pb-16 pt-6">
      {/* The header stays even when there is nothing to show: a page without a
          heading loses its place in the document outline and leaves screen
          readers with no landmark to jump to. */}
      <header className="mb-5">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Activity</h1>
        <p className="mt-[2px] text-[12.5px] text-[var(--text-muted)]">
          Everything that has happened in this workspace, newest first.
        </p>
      </header>

      <div className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        {empty && (
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="Every create, update, deployment and resolved issue is recorded here, and on the project and entity it touched."
            connects={[
              'who changed what, and when',
              'filterable by project',
              'secrets are never recorded',
            ]}
          />
        )}
        {entries.map((entry) => {
          const day = dayLabel(entry.createdAt);
          const showDay = day !== currentDay;
          currentDay = day;
          return (
            <div key={entry.id}>
              {showDay && (
                <div className="label sticky top-0 z-10 border-b border-line bg-[var(--surface-raised)] px-4 py-[6px]">
                  {day}
                </div>
              )}
              <div className="flex gap-3 px-4 py-[7px] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)]">
                <span className="mono w-[40px] shrink-0 pt-[1px] text-[11px] text-[var(--text-faint)]">
                  {clockTime(entry.createdAt)}
                </span>
                <span className="mono w-[110px] shrink-0 truncate pt-[1px] text-[11px] text-[var(--text-faint)]">
                  {entry.action}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px]">{entry.summary}</span>
                {entry.project && (
                  <Link
                    href={`/projects/${entry.project.slug}`}
                    className="mono shrink-0 text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)]"
                  >
                    {entry.project.name}
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex flex-col gap-[10px] p-4">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-[13px]" style={{ width: `${90 - row * 12}%` }} />
            ))}
          </div>
        )}
      </div>

      {page < pages && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => void load(page + 1)} disabled={loading}>
            {loading ? 'Loading…' : `Load older (${page} of ${pages})`}
          </Button>
        </div>
      )}
    </div>
  );
}
