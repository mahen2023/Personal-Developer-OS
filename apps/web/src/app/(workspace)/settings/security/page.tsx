'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  TriangleAlert,
  Unlock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx, dayLabel, clockTime, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { useAction, useList, useListQuery } from '@/hooks/useResource';
import { useVault } from '@/components/system/VaultProvider';
import { Button, EmptyState, type Signal, StatusIndicator } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import { Field, FormError, TextInput } from '@/components/patterns/Form';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

/** Each recorded action, and how alarming it should look. */
const ACTION_STYLE: Record<string, { signal: Signal; icon: typeof Eye }> = {
  LOGIN: { signal: 'success', icon: LogIn },
  LOGIN_FAILED: { signal: 'danger', icon: TriangleAlert },
  LOGOUT: { signal: 'neutral', icon: LogOut },
  SESSION_REVOKED: { signal: 'warning', icon: LogOut },
  PASSWORD_CHANGED: { signal: 'warning', icon: KeyRound },
  VAULT_UNLOCKED: { signal: 'security', icon: Unlock },
  VAULT_LOCKED: { signal: 'neutral', icon: Lock },
  VAULT_MASTER_CHANGED: { signal: 'warning', icon: KeyRound },
  SECRET_CREATED: { signal: 'info', icon: ShieldCheck },
  SECRET_VIEWED: { signal: 'security', icon: Eye },
  SECRET_UPDATED: { signal: 'info', icon: ShieldCheck },
  SECRET_DELETED: { signal: 'warning', icon: TriangleAlert },
  SECRET_EXPORTED: { signal: 'danger', icon: TriangleAlert },
};

export default function SecurityPage() {
  const { set, queryString } = useListQuery({ limit: '50' });
  const { data, loading } = useList<AuditEntry>('/vault/audit', queryString);

  return (
    <div className="mx-auto max-w-[820px] px-6 pb-16 pt-6">
      <PageHeader
        icon={ShieldCheck}
        title="Security"
        subtitle="Vault settings, and every security-sensitive thing that has happened."
      />

      <VaultSettings />

      <section className="mt-4 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
          Audit log
          {data && <span className="num text-[var(--text-faint)]">{data.total}</span>}
        </div>

        {!loading && (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing recorded yet"
            description="Sign-ins, vault unlocks and every secret you reveal land here. The fact is recorded; the value never is."
          />
        ) : (
          <AuditTimeline entries={data?.items ?? []} />
        )}
      </section>

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

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Values are never written to this log, to the activity feed, or to the application logs. What
        is recorded is which item was touched and when.{' '}
        <Link href="/vault" className="hover:text-[var(--accent)]">
          Open the vault
        </Link>
      </p>
    </div>
  );
}

function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  let currentDay = '';
  return (
    <div className="stagger py-1">
      {entries.map((entry) => {
        const day = dayLabel(entry.createdAt);
        const showDay = day !== currentDay;
        currentDay = day;
        const style = ACTION_STYLE[entry.action] ?? {
          signal: 'neutral' as Signal,
          icon: ShieldCheck,
        };
        const Icon = style.icon;

        return (
          <div key={entry.id}>
            {showDay && <div className="label px-4 pb-1 pt-3">{day}</div>}
            <div className="flex items-center gap-3 px-4 py-[5px]">
              <span className="mono w-[40px] shrink-0 text-[11px] text-[var(--text-faint)]">
                {clockTime(entry.createdAt)}
              </span>
              <Icon
                size={12}
                className="shrink-0"
                style={{
                  color: `var(--${style.signal === 'neutral' ? 'text-faint' : style.signal})`,
                }}
              />
              <span
                className={cx(
                  'min-w-0 flex-1 truncate text-[12.5px]',
                  entry.success ? 'text-[var(--text-muted)]' : 'text-[var(--danger)]',
                )}
              >
                {humanise(entry.action)}
                {!entry.success && ' — failed'}
              </span>
              {entry.entityId && (
                <Link
                  href={`/vault/${entry.entityId}`}
                  className="mono hidden shrink-0 text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)] lg:inline"
                >
                  {entry.entityId.slice(0, 8)}
                </Link>
              )}
              <span className="mono w-[110px] shrink-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {entry.ip ?? ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VaultSettings() {
  const { status, unlocked, locksIn, lock, refresh } = useVault();
  const [autoLock, setAutoLock] = useState('');
  const [clipboard, setClipboard] = useState('');

  const save = useAction((body: Record<string, unknown>) =>
    api('/vault/settings', { method: 'PATCH', body }),
  );

  if (!status?.configured) {
    return (
      <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        <div className="label border-b border-line px-4 py-[9px]">Vault</div>
        <p className="px-4 py-4 text-[12.5px] text-[var(--text-muted)]">
          Not set up yet.{' '}
          <Link href="/vault" className="text-[var(--accent)] hover:underline">
            Create your vault
          </Link>{' '}
          to store passwords, API keys and SSH credentials.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        Vault
        <StatusIndicator
          signal={unlocked ? 'security' : 'neutral'}
          label={unlocked ? `unlocked · ${Math.floor((locksIn ?? 0) / 60)}m left` : 'locked'}
        />
        {unlocked && (
          <Button variant="ghost" className="ml-auto" onClick={lock}>
            <Lock size={12} /> Lock now
          </Button>
        )}
      </div>

      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await save.run({
            ...(autoLock ? { autoLockMinutes: Number(autoLock) } : {}),
            ...(clipboard ? { clipboardSeconds: Number(clipboard) } : {}),
          });
          await refresh();
          setAutoLock('');
          setClipboard('');
        }}
      >
        <FormError error={save.error} />

        <Field label="Auto-lock" hint={`Currently ${status.autoLockMinutes} minutes.`}>
          <TextInput
            type="number"
            min={1}
            max={480}
            value={autoLock}
            onChange={(event) => setAutoLock(event.target.value)}
            placeholder={String(status.autoLockMinutes)}
          />
        </Field>

        <Field label="Clipboard clears" hint={`Currently ${status.clipboardSeconds} seconds.`}>
          <TextInput
            type="number"
            min={5}
            max={300}
            value={clipboard}
            onChange={(event) => setClipboard(event.target.value)}
            placeholder={String(status.clipboardSeconds)}
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={save.busy || (!autoLock && !clipboard)}>
            {save.busy ? 'Saving…' : 'Save vault settings'}
          </Button>
          <span className="mono text-[11px] text-[var(--text-faint)]">
            {status.counts.total ?? 0} items · last unlocked{' '}
            {status.lastUnlockedAt ? timeAgo(status.lastUnlockedAt) : 'never'}
          </span>
        </div>
      </form>
    </section>
  );
}
