'use client';

import { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, TriangleAlert, Unlock } from 'lucide-react';
import { cx } from '@/lib/format';
import { entropyBits, strengthOf } from '@/lib/vault-crypto';
import { useVault } from '@/components/system/VaultProvider';
import { Button, LoadingLine } from '@/components/primitives';
import { FormError, TextInput } from '@/components/patterns/Form';

/**
 * The vault's own chrome (§74).
 *
 * It deliberately looks unlike the rest of the application: darker ground, a
 * steel accent instead of brass, a terminal-style caret. The point is that you
 * always know, without reading anything, whether you are looking at a screen
 * that can show secrets.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const { status, unlocked, busy, error, unlock, setup } = useVault();

  if (!status) return <LoadingLine message="Checking the vault…" />;
  if (unlocked) return <>{children}</>;

  return status.configured ? (
    <UnlockScreen
      onUnlock={unlock}
      busy={busy}
      error={error}
      lastUnlockedAt={status.lastUnlockedAt}
    />
  ) : (
    <SetupScreen onSetup={setup} busy={busy} error={error} />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-10">
      <div className="anim-enter w-full max-w-[420px]">{children}</div>
    </div>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded border border-[color-mix(in_srgb,var(--security)_40%,transparent)] bg-[color-mix(in_srgb,var(--security)_12%,transparent)] text-[var(--security)]">
          {icon}
        </span>
        <div>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
          <p className="text-[12px] text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <span className="mono ml-auto text-[11px] text-[var(--text-faint)]">
          locked
          <span style={{ animation: 'caret 1.1s step-end infinite' }}>_</span>
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--security)_25%,transparent)] bg-[var(--surface-sunken)]">
        {children}
      </div>
    </>
  );
}

function UnlockScreen({
  onUnlock,
  busy,
  error,
  lastUnlockedAt,
}: {
  onUnlock: (password: string) => Promise<boolean>;
  busy: boolean;
  error: ReturnType<typeof useVault>['error'];
  lastUnlockedAt: string | null;
}) {
  const [password, setPassword] = useState('');

  return (
    <Shell>
      <Panel
        icon={<Lock size={16} />}
        title="Secure vault"
        subtitle="Passwords, API keys, SSH keys and TOTP."
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onUnlock(password)) setPassword('');
          }}
          className="flex flex-col gap-3 p-4"
        >
          <FormError error={error} />

          <label className="flex flex-col gap-[5px]">
            <span className="label">Master password</span>
            <TextInput
              autoFocus
              required
              type="password"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mono"
            />
          </label>

          <Button type="submit" variant="primary" disabled={busy || password.length === 0}>
            <Unlock size={13} />
            {busy ? 'Deriving key…' : 'Unlock vault'}
          </Button>

          {busy && (
            <p className="mono text-[11px] text-[var(--text-faint)]">
              Argon2id is intentionally slow — this is the work an attacker also has to do.
            </p>
          )}
        </form>

        <div className="mono border-t border-line px-4 py-[9px] text-[11px] text-[var(--text-faint)]">
          {lastUnlockedAt
            ? `last unlocked ${new Date(lastUnlockedAt).toLocaleString()}`
            : 'never unlocked on this instance'}
        </div>
      </Panel>

      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        <ShieldCheck size={12} className="mt-[2px] shrink-0" />
        Your master password never leaves this browser. It derives a key here, and the server only
        ever sees ciphertext it cannot read.
      </p>
    </Shell>
  );
}

function SetupScreen({
  onSetup,
  busy,
  error,
}: {
  onSetup: (password: string) => Promise<boolean>;
  busy: boolean;
  error: ReturnType<typeof useVault>['error'];
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);

  // A rough read on the password the user typed, not on a generated one, so
  // the alphabet is inferred from what they actually used.
  const bits = entropyBits({
    length: password.length,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digits: /\d/.test(password),
    symbols: /[^a-zA-Z0-9]/.test(password),
  });
  const strength = strengthOf(bits);
  const matches = password.length > 0 && password === confirm;

  return (
    <Shell>
      <Panel
        icon={<KeyRound size={16} />}
        title="Set up your vault"
        subtitle="One master password, chosen once."
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onSetup(password);
          }}
          className="flex flex-col gap-3 p-4"
        >
          <FormError error={error} />

          <label className="flex flex-col gap-[5px]">
            <span className="label">Master password</span>
            <TextInput
              autoFocus
              required
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mono"
            />
          </label>

          {password.length > 0 && (
            <p className="flex items-center gap-2 text-[11.5px]">
              <span
                className="h-[6px] w-[6px] rounded-full"
                style={{ background: `var(--${strength.signal})` }}
              />
              <span style={{ color: `var(--${strength.signal})` }}>{strength.label}</span>
              <span className="mono text-[var(--text-faint)]">≈ {bits} bits</span>
            </p>
          )}

          <label className="flex flex-col gap-[5px]">
            <span className="label">Confirm</span>
            <TextInput
              required
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mono"
            />
          </label>

          <label
            className={cx(
              'flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-[12px] leading-relaxed',
              understood
                ? 'border-line text-[var(--text-muted)]'
                : 'border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)]',
            )}
          >
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-[3px] accent-[var(--accent)]"
            />
            <span className="flex items-start gap-2">
              <TriangleAlert size={13} className="mt-[2px] shrink-0 text-[var(--warning)]" />
              <span>
                There is no recovery. Nobody — including this application — can decrypt your vault
                without this password. If you lose it, the contents are gone.
              </span>
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            disabled={busy || !matches || password.length < 12 || !understood}
          >
            {busy ? 'Deriving key…' : 'Create vault'}
          </Button>

          {confirm.length > 0 && !matches && (
            <p className="text-[11.5px] text-[var(--danger)]">Those two do not match.</p>
          )}
        </form>
      </Panel>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Back up <span className="mono">VAULT_ENVELOPE_KEY</span> from your{' '}
        <span className="mono">.env</span> somewhere separate from your database backup. Both halves
        are needed to restore, and keeping them together defeats the point of having two.
      </p>
    </Shell>
  );
}
