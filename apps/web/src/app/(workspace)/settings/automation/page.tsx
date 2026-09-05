'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  Mail,
  Play,
  RefreshCw,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { useAction } from '@/hooks/useResource';
import { useNotifications } from '@/components/system/NotificationProvider';
import { Button, StatusIndicator } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';

interface Status {
  workerEnabled: boolean;
  redis: boolean;
  email: boolean;
  schedules: { name: string; pattern: string; next: string | null }[];
  counts: Record<string, number>;
  recent: { name: string; finishedAt: string | null; failed: boolean; detail: string }[];
  backups: { file: string; bytes: number; createdAt: string }[];
  exportable: string[];
}

interface Preferences {
  email: boolean;
  browser: boolean;
  muted: string[];
  kinds: string[];
}

const FORMATS = [
  ['json', 'JSON', 'Everything, machine-readable. The format to keep.'],
  ['markdown', 'Markdown', 'Readable prose. Drops straight into another notes app.'],
  ['csv', 'CSV', 'One block per type, for a spreadsheet.'],
] as const;

/**
 * What the application does on its own, and how to take your data out (§46,
 * §51, §52).
 *
 * The screen is arranged around one question a person actually asks: is
 * anything running, and can I get out? Everything else — the schedule, the
 * queue, the backups on disk — is evidence for that answer.
 */
export default function AutomationPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [next, prefs] = await Promise.allSettled([
      api<Status>('/automation/status'),
      api<Preferences>('/notifications/preferences'),
    ]);
    if (next.status === 'fulfilled') setStatus(next.value);
    if (prefs.status === 'fulfilled') setPreferences(prefs.value);

    // A section that vanishes when its request fails is worse than one that
    // says so: the screen looks complete and quietly is not.
    const problem = [next, prefs].find((result) => result.status === 'rejected');
    setFailed(problem ? ((problem as PromiseRejectedResult).reason as Error).message : null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      <PageHeader
        icon={RefreshCw}
        title="Automation"
        subtitle="Scheduled scans, notifications, backups and export."
      />

      {failed && (
        <p
          role="alert"
          aria-label="Error"
          className="mb-3 flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12.5px] text-[var(--danger)]"
        >
          <TriangleAlert size={13} className="mt-[2px] shrink-0" />
          {failed} Some of this screen may be out of date.
        </p>
      )}

      <Schedule status={status} onChanged={load} />
      <Notifications
        preferences={preferences}
        emailConfigured={status?.email ?? false}
        onChanged={load}
      />
      <Backups status={status} onChanged={load} />
      <Exporting status={status} />
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        {title}
        {aside && <span className="ml-auto flex items-center gap-2">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── schedules ────────────────────────────────────────────────────────────── */

function Schedule({
  status,
  onChanged,
}: {
  status: Status | null;
  onChanged: () => Promise<void>;
}) {
  const scan = useAction(() => api<unknown[]>('/automation/scan', { method: 'POST' }));
  const [result, setResult] = useState<string | null>(null);

  return (
    <Section
      title="Scheduled scans"
      aside={
        status && (
          <StatusIndicator
            signal={status.workerEnabled ? 'success' : status.redis ? 'warning' : 'danger'}
            label={
              !status.redis
                ? 'Redis unreachable'
                : status.workerEnabled
                  ? 'worker running'
                  : 'no worker'
            }
          />
        )
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Every night the application checks what is about to expire, what is overdue and what is
          due for rotation, and raises a notification for anything it finds. Running it now does
          exactly the same work.
        </p>

        {status && !status.workerEnabled && (
          <p className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-dim)] px-3 py-2 text-[12px] leading-relaxed text-[var(--warning)]">
            <TriangleAlert size={13} className="mt-[2px] shrink-0" />
            <span>
              The schedule is registered but no worker process is consuming it. Start one with{' '}
              <code className="mono">npm run start:worker</code>, or keep using the button below.
            </span>
          </p>
        )}

        {status && status.schedules.length > 0 && (
          <ul className="overflow-hidden rounded border border-line">
            {status.schedules.map((schedule) => (
              <li
                key={schedule.name}
                className="flex items-center gap-3 border-b border-line px-3 py-[6px] text-[12px] last:border-b-0"
              >
                <span className="w-[70px] shrink-0">{humanise(schedule.name)}</span>
                <span className="mono text-[11px] text-[var(--text-faint)]">
                  {schedule.pattern}
                </span>
                <span className="mono ml-auto text-[11px] text-[var(--text-faint)]">
                  {schedule.next ? `next ${timeAgo(schedule.next)}` : 'not scheduled'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={scan.busy}
            onClick={async () => {
              const reports = (await scan.run()) as
                { scan: string; raised: number; cleared: number }[] | undefined;
              if (reports) {
                const raised = reports.reduce((sum, row) => sum + row.raised, 0);
                const cleared = reports.reduce((sum, row) => sum + row.cleared, 0);
                setResult(
                  raised === 0 && cleared === 0
                    ? 'Nothing changed — everything the scan checks is fine.'
                    : `${raised} raised, ${cleared} cleared.`,
                );
              }
              await onChanged();
            }}
          >
            <Play size={12} /> {scan.busy ? 'Scanning…' : 'Run the scan now'}
          </Button>
          {result && <span className="text-[12px] text-[var(--text-muted)]">{result}</span>}
        </div>

        {status && status.recent.length > 0 && (
          <div>
            <div className="label mb-1">Last runs</div>
            <ul className="flex flex-col gap-[2px]">
              {status.recent.map((job, index) => (
                <li key={index} className="flex items-baseline gap-2 text-[11.5px]">
                  <span
                    className="mono w-[60px] shrink-0"
                    style={{ color: job.failed ? 'var(--danger)' : 'var(--text-faint)' }}
                  >
                    {job.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
                    {job.detail || (job.failed ? 'failed' : 'completed')}
                  </span>
                  <span className="mono shrink-0 text-[var(--text-faint)]">
                    {job.finishedAt ? timeAgo(job.finishedAt) : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ── delivery ─────────────────────────────────────────────────────────────── */

function Notifications({
  preferences,
  emailConfigured,
  onChanged,
}: {
  preferences: Preferences | null;
  emailConfigured: boolean;
  onChanged: () => Promise<void>;
}) {
  const { desktop, enableDesktop } = useNotifications();
  const save = useAction((body: Record<string, unknown>) =>
    api<Preferences>('/notifications/preferences', { method: 'PATCH', body }),
  );
  const test = useAction(() =>
    api<{ ok: boolean; detail: string }>('/automation/mail/test', { method: 'POST' }),
  );

  if (!preferences) return null;

  const toggleMuted = (kind: string) =>
    preferences.muted.includes(kind)
      ? preferences.muted.filter((entry) => entry !== kind)
      : [...preferences.muted, kind];

  return (
    <Section title="Notifications">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Toggle
            label="Desktop notifications"
            hint={
              desktop === 'blocked'
                ? 'Blocked by the browser. Allow notifications for this site in your browser settings.'
                : desktop === 'unsupported'
                  ? 'This browser does not support them.'
                  : 'Raised by this tab, for anything new since it was opened.'
            }
            checked={desktop === 'on'}
            disabled={desktop === 'blocked' || desktop === 'unsupported'}
            onChange={async (next) => {
              if (next) await enableDesktop();
              else {
                await save.run({ browser: false });
                await onChanged();
              }
            }}
          />

          <Toggle
            label="Email"
            hint={
              emailConfigured
                ? 'Warnings and worse are emailed. Nothing sensitive is ever in the body.'
                : 'No SMTP server is configured, so nothing can be sent. Set MAIL_HOST in .env.'
            }
            checked={preferences.email}
            disabled={!emailConfigured}
            onChange={async (next) => {
              await save.run({ email: next });
              await onChanged();
            }}
          />

          {emailConfigured && (
            <div className="flex items-center gap-3">
              <Button disabled={test.busy} onClick={() => void test.run()}>
                <Mail size={12} /> {test.busy ? 'Checking…' : 'Test the connection'}
              </Button>
              {test.error && (
                <span className="text-[12px] text-[var(--danger)]">{test.error.message}</span>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="label mb-[6px]">Mute</div>
          <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
            A muted kind is never raised at all — not in the list, not by email. Nothing is stored
            about it, so unmuting brings it back on the next scan.
          </p>
          <div className="flex flex-wrap gap-[6px]">
            {preferences.kinds.map((kind) => {
              const muted = preferences.muted.includes(kind);
              return (
                <button
                  key={kind}
                  onClick={async () => {
                    await save.run({ muted: toggleMuted(kind) });
                    await onChanged();
                  }}
                  aria-pressed={muted}
                  className={cx(
                    'rounded border px-[8px] py-[3px] text-[11.5px] transition-colors duration-[var(--fast)]',
                    muted
                      ? 'border-line bg-[var(--surface-sunken)] text-[var(--text-faint)] line-through'
                      : 'border-line bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                  )}
                >
                  {humanise(kind)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void | Promise<void>;
}) {
  return (
    <label className={cx('flex items-start gap-3', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => void onChange(event.target.checked)}
        className="mt-[3px] h-[13px] w-[13px] shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px]">{label}</span>
        <span className="block text-[11.5px] leading-relaxed text-[var(--text-faint)]">{hint}</span>
      </span>
    </label>
  );
}

/* ── backups ──────────────────────────────────────────────────────────────── */

function Backups({ status, onChanged }: { status: Status | null; onChanged: () => Promise<void> }) {
  const backup = useAction(() => api<{ file: string }>('/automation/backup', { method: 'POST' }));
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function restore(file: File, mode: 'merge' | 'replace'): Promise<void> {
    if (mode === 'replace') {
      const confirmed = window.confirm(
        'Replace deletes every record in this account before restoring — projects, notes, ' +
          'infrastructure and vault items. This cannot be undone. Continue?',
      );
      if (!confirmed) return;
    }
    setRestoring(true);
    setMessage(null);
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    try {
      // Bypasses the `api` helper on purpose: it JSON-encodes every body, and
      // a multipart upload has to keep the boundary the browser generates.
      const response = await fetch('/api/automation/restore', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const payload = (await response.json()) as {
        restored?: Record<string, number>;
        skipped?: string[];
        message?: string;
      };
      if (!response.ok) throw new Error(payload.message ?? 'The restore failed.');

      const result = { restored: payload.restored ?? {}, skipped: payload.skipped ?? [] };
      const total = Object.values(result.restored).reduce((sum, count) => sum + count, 0);
      setMessage(
        `Restored ${total} records.${result.skipped.length ? ` Skipped: ${result.skipped.join('; ')}` : ''}`,
      );
      await onChanged();
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Section title="Backups">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          A backup is one gzipped file holding every record in this account, including vault items
          as the ciphertext they are. It cannot be read without your master password <em>and</em>{' '}
          the envelope key from <code className="mono">.env</code> — so keep that key somewhere the
          backups are not.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={backup.busy}
            onClick={async () => {
              await backup.run();
              await onChanged();
            }}
          >
            <Archive size={12} /> {backup.busy ? 'Writing…' : 'Back up now'}
          </Button>

          <label className="inline-flex h-[30px] cursor-pointer items-center gap-[6px] rounded border border-line bg-[var(--surface-raised)] px-[10px] text-[12px] font-medium hover:border-[var(--line-strong)]">
            <Upload size={12} />
            {restoring ? 'Restoring…' : 'Restore (merge)'}
            <input
              type="file"
              accept=".gz,.json"
              className="hidden"
              disabled={restoring}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void restore(file, 'merge');
              }}
            />
          </label>

          <label className="inline-flex h-[30px] cursor-pointer items-center gap-[6px] rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-dim)] px-[10px] text-[12px] font-medium text-[var(--danger)]">
            <TriangleAlert size={12} />
            Restore (replace)
            <input
              type="file"
              accept=".gz,.json"
              className="hidden"
              disabled={restoring}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void restore(file, 'replace');
              }}
            />
          </label>
        </div>

        {message && (
          <p className="flex items-start gap-2 text-[12px] text-[var(--text-muted)]">
            <CheckCircle2 size={13} className="mt-[2px] shrink-0 text-[var(--success)]" />
            {message}
          </p>
        )}

        {status && status.backups.length > 0 ? (
          <ul className="overflow-hidden rounded border border-line">
            {status.backups.map((file) => (
              <li
                key={file.file}
                className="flex items-center gap-3 border-b border-line px-3 py-[6px] text-[12px] last:border-b-0"
              >
                <span className="mono min-w-0 flex-1 truncate text-[11px]">{file.file}</span>
                <span className="mono shrink-0 text-[11px] text-[var(--text-faint)]">
                  {(file.bytes / 1024).toFixed(0)} KB
                </span>
                <span className="mono w-[70px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                  {timeAgo(file.createdAt)}
                </span>
                <a
                  href={`/api/automation/backup/download?file=${encodeURIComponent(file.file)}`}
                  className="shrink-0 text-[var(--text-faint)] hover:text-[var(--accent)]"
                  aria-label={`Download ${file.file}`}
                >
                  <Download size={13} />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-faint)]">No backups on disk yet.</p>
        )}
      </div>
    </Section>
  );
}

/* ── export ───────────────────────────────────────────────────────────────── */

function Exporting({ status }: { status: Status | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>('json');

  const query = new URLSearchParams({ format });
  if (selected.length > 0) query.set('what', selected.join(','));

  return (
    <Section title="Export">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Your records, in a format something else can read. Vault secrets are not included and
          cannot be — the server has never been able to decrypt them.
        </p>

        <div className="flex flex-col gap-2">
          {FORMATS.map(([value, label, detail]) => (
            <label key={value} className="flex items-start gap-3">
              <input
                type="radio"
                name="format"
                checked={format === value}
                onChange={() => setFormat(value)}
                className="mt-[3px] shrink-0 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[12.5px]">{label}</span>
                <span className="block text-[11.5px] text-[var(--text-faint)]">{detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <div className="label mb-[6px]">
            What to include {selected.length === 0 && '— everything'}
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {(status?.exportable ?? []).map((name) => {
              const on = selected.includes(name);
              return (
                <button
                  key={name}
                  onClick={() =>
                    setSelected(
                      on ? selected.filter((entry) => entry !== name) : [...selected, name],
                    )
                  }
                  aria-pressed={on}
                  className={cx(
                    'rounded border px-[8px] py-[3px] text-[11.5px] transition-colors duration-[var(--fast)]',
                    on
                      ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                      : 'border-line bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
                  )}
                >
                  {humanise(name)}
                </button>
              );
            })}
          </div>
        </div>

        <a
          href={`/api/automation/export?${query.toString()}`}
          className="inline-flex h-[30px] w-fit items-center gap-[6px] rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[10px] text-[12px] font-medium text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
        >
          <Download size={12} /> Download export
        </a>
      </div>
    </Section>
  );
}
