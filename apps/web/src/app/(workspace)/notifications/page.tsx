'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { useAction, useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
import { KIND, type NotificationRow, SEVERITY, hrefFor } from '@/lib/notifications';
import { PageHeader } from '@/components/patterns/PageShell';

/**
 * Everything the application noticed while you were not looking (§37).
 *
 * The list is a set of live claims, not a log: a warning disappears when its
 * cause is fixed, without anyone having to tick it off. That is what makes an
 * empty list mean something, and it is why "nothing needs attention" is worth
 * saying rather than hiding.
 */
export default function NotificationsPage() {
  const { values, set, queryString } = useListQuery({ limit: '40' });
  const { data, loading, reload } = useList<NotificationRow>('/notifications', queryString);
  const unreadOnly = values.unread === 'true';

  const markAll = useAction(() => api('/notifications/read', { method: 'PATCH' }));
  // Null until the list has actually been counted. Rendering "Unread (0)"
  // while still loading claims a fact the page does not have yet, and it is
  // indistinguishable from the real answer.
  const unread = (data as { unread?: number } | null)?.unread ?? null;

  const dismiss = useCallback(
    async (id: string) => {
      await api(`/notifications/${id}`, { method: 'DELETE' }).catch(() => undefined);
      reload();
    },
    [reload],
  );

  const open = useCallback(
    async (id: string) => {
      await api(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => undefined);
      reload();
    },
    [reload],
  );

  return (
    <div className="mx-auto max-w-[820px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Bell}
        title="Attention"
        subtitle="Raised by the nightly scan. Each one disappears when its cause does."
        count={data?.total}
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => set({ unread: unreadOnly ? undefined : 'true' })}
              aria-pressed={unreadOnly}
              className={cx(unreadOnly && 'text-[var(--accent)]')}
            >
              {unreadOnly ? 'Showing unread' : unread === null ? 'Unread' : `Unread (${unread})`}
            </Button>
            <Button
              disabled={unread === null || unread === 0 || markAll.busy}
              onClick={async () => {
                await markAll.run();
                reload();
              }}
            >
              <Check size={12} /> Mark all read
            </Button>
          </>
        }
      />

      {!loading && (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? 'Nothing unread' : 'Nothing needs attention'}
          description="Certificates, domain registrations, due tasks and secrets past their rotation date all appear here. An empty list means the scan found nothing wrong."
          connects={['certificates and domains', 'tasks with a due date', 'secrets set to rotate']}
          action={
            <Link
              href="/settings/automation"
              className="text-[12.5px] text-[var(--accent)] hover:underline"
            >
              Check the scan is scheduled
            </Link>
          }
        />
      ) : (
        <ul className="stagger overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          {(data?.items ?? []).map((row) => (
            <Row key={row.id} row={row} onOpen={open} onDismiss={dismiss} />
          ))}
        </ul>
      )}

      {data && data.pages > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            disabled={data.page <= 1}
            onClick={() => set({ page: String(data.page - 1) })}
          >
            Newer
          </Button>
          <span className="mono text-[11.5px] text-[var(--text-faint)]">
            {data.page} / {data.pages}
          </span>
          <Button
            variant="ghost"
            disabled={data.page >= data.pages}
            onClick={() => set({ page: String(data.page + 1) })}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  onOpen,
  onDismiss,
}: {
  row: NotificationRow;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const Icon = (KIND[row.kind] ?? KIND.SYSTEM).icon;
  const href = hrefFor(row);

  return (
    <li
      className={cx(
        'flex items-start gap-3 border-b border-line px-3 py-[9px] last:border-b-0',
        // Unread carries a coloured edge rather than a filled background: a
        // list of tinted blocks is unreadable once there are more than three.
        !row.readAt && 'border-l-2',
      )}
      style={!row.readAt ? { borderLeftColor: `var(--${SEVERITY[row.severity]})` } : undefined}
    >
      <Icon
        size={13}
        className="mt-[3px] shrink-0"
        style={{ color: `var(--${SEVERITY[row.severity]})` }}
      />

      <Link href={href} onClick={() => onOpen(row.id)} className="min-w-0 flex-1 group">
        <span
          className={cx(
            'block text-[12.5px] group-hover:text-[var(--accent)]',
            row.readAt ? 'text-[var(--text-muted)]' : 'font-medium',
          )}
        >
          {row.title}
        </span>
        {row.body && (
          <span className="mt-[1px] block text-[11.5px] leading-relaxed text-[var(--text-faint)]">
            {row.body}
          </span>
        )}
      </Link>

      <span className="mono hidden w-[92px] shrink-0 text-right text-[11px] text-[var(--text-faint)] sm:block">
        {humanise(row.kind)}
      </span>
      <span className="mono w-[62px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
        {timeAgo(row.createdAt)}
      </span>

      <button
        // Dismiss is for "I know, and I am choosing to live with it" — the scan
        // will not raise this exact fact again.
        title="Dismiss — this will not come back unless it gets worse"
        aria-label={`Dismiss: ${row.title}`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          onDismiss(row.id);
        }}
        className="mt-[2px] shrink-0 text-[var(--text-faint)] transition-colors duration-[var(--fast)] hover:text-[var(--danger)]"
      >
        <X size={13} />
      </button>
    </li>
  );
}
