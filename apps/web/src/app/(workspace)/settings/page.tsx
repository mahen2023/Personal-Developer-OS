'use client';

import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useTheme, type ThemePreference } from '@/components/system/ThemeProvider';
import { useWorkspace } from '@/components/system/WorkspaceProvider';
import { Button, StatusIndicator } from '@/components/primitives';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/** Settings that live on their own screen, linked rather than duplicated. */
const ELSEWHERE: [string, string, string][] = [
  ['/settings/security', 'Vault & security', 'Auto-lock, clipboard timeout and the audit log.'],
  ['/settings/automation', 'Automation', 'Scans, notifications, backups and export.'],
  ['/intelligence', 'Intelligence', 'The retrieval index and which model reads it.'],
  ['/settings/integrations', 'Integrations', 'GitHub, GitLab and Cloudflare. All optional.'],
  ['/settings/diagnostics', 'Diagnostics', 'What each subsystem reports about itself.'],
];

const PLANNED: [string, string][] = [
  ['Keyboard Shortcuts', 'Rebind any chord.'],
  ['Storage', 'S3, GCS or MinIO instead of the local filesystem.'],
  [
    'More integrations',
    'AWS, GCP and Docker need request signing or a local socket; neither is built.',
  ],
];

export default function SettingsPage() {
  const { user, refresh } = useWorkspace();
  const { preference, setPreference } = useTheme();

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      <header className="mb-5">
        <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Settings</h1>
        <p className="mt-[2px] text-[12.5px] text-[var(--text-muted)]">
          This instance is yours alone. Nothing here leaves the machine it runs on.
        </p>
      </header>

      <Section title="Profile">
        <ProfileForm
          key={user?.id}
          name={user?.name ?? ''}
          timezone={user?.timezone ?? 'UTC'}
          email={user?.email ?? ''}
          onSaved={refresh}
        />
      </Section>

      <Section title="Appearance">
        <div className="flex flex-col gap-[10px] p-4">
          <span className="text-[12.5px] text-[var(--text-muted)]">
            Dark is the primary experience; light is a full peer, not an afterthought.
          </span>
          <div className="flex gap-[6px]">
            {(
              [
                ['dark', 'Dark', Moon],
                ['light', 'Light', Sun],
                ['system', 'System', Monitor],
              ] as [ThemePreference, string, typeof Moon][]
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => setPreference(value)}
                className={cx(
                  'flex h-[30px] items-center gap-[6px] rounded border px-[10px] text-[12px] transition-colors duration-[var(--fast)]',
                  preference === value
                    ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                    : 'border-line bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Security">
        <PasswordForm />
        <SessionList />
      </Section>

      <Section title="Elsewhere">
        <ul className="p-4">
          {ELSEWHERE.map(([href, title, detail]) => (
            <li key={href} className="flex items-baseline gap-3 py-[3px] text-[12.5px]">
              <a href={href} className="w-[150px] shrink-0 hover:text-[var(--accent)]">
                {title}
              </a>
              <span className="text-[var(--text-faint)]">{detail}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Planned">
        <ul className="p-4">
          {PLANNED.map(([title, detail]) => (
            <li key={title} className="flex items-baseline gap-3 py-[3px] text-[12.5px]">
              <span className="w-[150px] shrink-0 text-[var(--text-muted)]">{title}</span>
              <span className="text-[var(--text-faint)]">{detail}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="label border-b border-line px-4 py-[9px]">{title}</div>
      {children}
    </section>
  );
}

function ProfileForm({
  name,
  timezone,
  email,
  onSaved,
}: {
  name: string;
  timezone: string;
  email: string;
  onSaved: () => Promise<void>;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('saving');
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: { name: String(form.get('name')), timezone: String(form.get('timezone')) },
      });
      await onSaved();
      setState('saved');
      // The confirmation fades on its own; a toast for a saved field is noise (§70).
      setTimeout(() => setState('idle'), 2000);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save.');
      setState('idle');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
      <Field label="Email" value={email} readOnly />
      <Field label="Name" name="name" defaultValue={name} required />
      <Field label="Timezone" name="timezone" defaultValue={timezone} mono required />
      {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save profile'}
        </Button>
        {state === 'saved' && (
          <span className="anim-enter flex items-center gap-[5px] text-[12px] text-[var(--success)]">
            <Check size={13} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function PasswordForm() {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: String(form.get('currentPassword')),
          newPassword: String(form.get('newPassword')),
        },
      });
      // The API revokes every session on a password change, so the only correct
      // next step is a fresh sign-in.
      window.location.href = '/login';
    } catch (caught) {
      setMessage({
        text: caught instanceof ApiError ? caught.message : 'Could not change password.',
        ok: false,
      });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-line p-4">
      <p className="text-[12px] text-[var(--text-faint)]">
        Changing your password signs out every session, including this one.
      </p>
      <Field label="Current password" name="currentPassword" type="password" required />
      <Field label="New password" name="newPassword" type="password" required minLength={12} />
      {message && (
        <p
          className={cx(
            'text-[12px]',
            message.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]',
          )}
        >
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}

function SessionList() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  const load = () =>
    api<SessionRow[]>('/auth/sessions')
      .then(setSessions)
      .catch(() => setSessions([]));
  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string) {
    await api(`/auth/sessions/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await load();
  }

  return (
    <div className="border-t border-line">
      <div className="label px-4 pt-3">Active sessions</div>
      <ul className="p-4 pt-2">
        {(sessions ?? []).map((session) => (
          <li key={session.id} className="flex items-center gap-3 py-[5px]">
            <StatusIndicator signal={session.isCurrent ? 'success' : 'neutral'} />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">
              {session.userAgent ?? 'Unknown client'}
            </span>
            <span className="mono shrink-0 text-[11px] text-[var(--text-faint)]">
              {session.ip ?? '—'} · {timeAgo(session.lastUsedAt)}
            </span>
            {session.isCurrent ? (
              <span className="label w-[52px] text-right">this one</span>
            ) : (
              <button
                onClick={() => void revoke(session.id)}
                aria-label="Revoke session"
                className="flex w-[52px] justify-end text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
        {sessions?.length === 0 && (
          <li className="text-[12px] text-[var(--text-faint)]">No other sessions.</li>
        )}
      </ul>
    </div>
  );
}

function Field({
  label,
  mono,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; mono?: boolean }) {
  return (
    <label className="flex items-center gap-3">
      <span className="label w-[130px] shrink-0">{label}</span>
      <input
        {...props}
        className={cx(
          'h-[28px] flex-1 rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] text-[var(--text)] outline-none transition-colors duration-[var(--fast)] focus:border-[var(--accent-line)] read-only:text-[var(--text-faint)]',
          mono && 'mono',
        )}
      />
    </label>
  );
}
