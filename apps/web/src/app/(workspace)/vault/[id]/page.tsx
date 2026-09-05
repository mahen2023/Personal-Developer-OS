'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clipboard, Eye, EyeOff, ExternalLink, Lock, TriangleAlert } from 'lucide-react';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { type SecretPayload, totp, totpRemaining } from '@/lib/vault-crypto';
import { useRecord } from '@/hooks/useResource';
import { useVault } from '@/components/system/VaultProvider';
import { Badge, Button, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { VaultGate } from '../VaultGate';
import { VaultItemEditor } from '../VaultItemEditor';
import { VaultStatusBar } from '../VaultStatusBar';
import type { VaultRow } from '../VaultList';

export default function VaultItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <VaultGate>
      <VaultItem id={id} />
    </VaultGate>
  );
}

function VaultItem({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const { data: item, loading, set } = useRecord<VaultRow>(`/vault/items/${id}`);
  const { authHeader } = useVault();

  useContextPanel('Secret', item ? <VaultItemContext item={item} /> : null, [
    item?.id,
    item?.updatedAt,
  ]);

  if (loading && !item) return <LoadingLine message="Loading item…" />;
  if (!item) return null;

  if (editing) {
    return (
      <VaultItemEditor
        item={item}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-[760px] px-6 pt-6">
        <VaultStatusBar />
      </div>

      <DetailShell
        title={item.name}
        eyebrow={`Vault · ${humanise(item.type)}`}
        width="760px"
        onEdit={() => setEditing(true)}
        deletePath={`/vault/items/${id}`}
        deleteBackTo="/vault"
        deleteConfirm={`Delete "${item.name}"? The secret is unrecoverable once it is gone.`}
        meta={
          <>
            <Badge signal="security">{item.type}</Badge>
            {item.username && <span>{item.username}</span>}
            {item.project && (
              <Link href={`/projects/${item.project.slug}`} className="hover:text-[var(--accent)]">
                {item.project.name}
              </Link>
            )}
            {item.lastViewedAt && <span>last viewed {timeAgo(item.lastViewedAt)}</span>}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {item.needsRotation && (
            <p className="flex items-center gap-2 rounded border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)] px-3 py-2 text-[12.5px]">
              <TriangleAlert size={13} className="shrink-0 text-[var(--warning)]" />
              Last rotated {item.lastRotatedAt ? timeAgo(item.lastRotatedAt) : 'never'}, past the{' '}
              {item.rotateEveryD}-day age you set. Replace it and save the new value.
            </p>
          )}

          <SecretPanel item={item} />

          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mono flex items-center gap-[6px] text-[12.5px] text-[var(--info)] hover:underline"
            >
              <span className="truncate">{item.url}</span>
              <ExternalLink size={12} className="shrink-0" />
            </a>
          )}

          {item.notes && (
            <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">{item.notes}</p>
          )}

          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
            <Lock size={12} className="mt-[2px] shrink-0 text-[var(--security)]" />
            Revealing a secret is recorded in the audit log — the fact, never the value. Requests
            carry an unlock token, so a stolen session alone cannot read this.
            {authHeader()['x-vault-token'] ? '' : ' The vault is currently locked.'}
          </p>
        </div>
      </DetailShell>
    </div>
  );
}

/**
 * The reveal surface (§22, §74).
 *
 * Nothing is fetched until you ask. Secrets stay masked by default, the copy
 * button clears the clipboard afterwards, and a TOTP shows a live countdown so
 * you know whether the code will still be valid when you paste it.
 */
function SecretPanel({ item }: { item: VaultRow }) {
  const { revealSecret, copyWithTimeout } = useVault();
  const [payload, setPayload] = useState<SecretPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setFailed(null);
    try {
      setPayload(await revealSecret(item.id));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not decrypt that item.');
    } finally {
      setBusy(false);
    }
  }, [item.id, revealSecret]);

  async function copy(value: string) {
    const seconds = await copyWithTimeout(value);
    setCopied(seconds);
    window.setTimeout(() => setCopied(null), seconds * 1000);
  }

  if (item.type === 'TOTP') {
    return (
      <TotpPanel
        item={item}
        payload={payload}
        onLoad={load}
        busy={busy}
        failed={failed}
        onCopy={copy}
        copied={copied}
      />
    );
  }

  const value = payload?.secret ?? payload?.privateKey ?? '';
  const multiline = Boolean(payload?.privateKey);

  return (
    <section className="overflow-hidden rounded border border-[color-mix(in_srgb,var(--security)_25%,transparent)] bg-[var(--surface-raised)]">
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        <Lock size={11} className="text-[var(--security)]" />
        {item.type === 'SSH_KEY' ? 'Private key' : 'Secret'}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {failed && <p className="text-[12.5px] text-[var(--danger)]">{failed}</p>}

        {payload === null ? (
          <div className="flex items-center gap-3">
            <code className="mono flex-1 select-none text-[13px] tracking-[0.2em] text-[var(--text-faint)]">
              ••••••••••••••••
            </code>
            <Button variant="primary" onClick={() => void load()} disabled={busy}>
              <Eye size={13} /> {busy ? 'Decrypting…' : 'Reveal'}
            </Button>
          </div>
        ) : (
          <>
            {multiline ? (
              <pre
                className={cx(
                  'mono max-h-[280px] overflow-auto rounded border border-line bg-[var(--surface-sunken)] px-3 py-2 text-[11.5px] leading-relaxed',
                  !visible && 'blur-[5px] select-none',
                )}
              >
                {value}
              </pre>
            ) : (
              <code
                className={cx(
                  'mono block break-all rounded border border-line bg-[var(--surface-sunken)] px-3 py-2 text-[13px]',
                  !visible && 'blur-[5px] select-none',
                )}
              >
                {value}
              </code>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setVisible((current) => !current)}>
                {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                {visible ? 'Hide' : 'Show'}
              </Button>
              <Button variant="primary" onClick={() => void copy(value)}>
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                {copied ? `Copied — clears in ${copied}s` : 'Copy'}
              </Button>
              {payload.passphrase && (
                <Button onClick={() => void copy(payload.passphrase as string)}>
                  Copy passphrase
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setPayload(null);
                  setVisible(false);
                }}
              >
                Clear from screen
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** A live TOTP with the countdown that tells you whether to wait (§24). */
function TotpPanel({
  item,
  payload,
  onLoad,
  busy,
  failed,
  onCopy,
  copied,
}: {
  item: VaultRow;
  payload: SecretPayload | null;
  onLoad: () => Promise<void>;
  busy: boolean;
  failed: string | null;
  onCopy: (value: string) => Promise<void>;
  copied: number | null;
}) {
  const period = 30;
  const [code, setCode] = useState('');
  const [remaining, setRemaining] = useState(period);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload?.totpSecret) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await totp(payload.totpSecret as string, { period });
        if (!cancelled) {
          setCode(next);
          setRemaining(totpRemaining(period));
          setError(null);
        }
      } catch {
        if (!cancelled) setError('That secret is not valid base32.');
      }
    };

    void tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payload]);

  const urgent = remaining <= 5;

  return (
    <section className="overflow-hidden rounded border border-[color-mix(in_srgb,var(--security)_25%,transparent)] bg-[var(--surface-raised)]">
      <div className="label flex h-8 items-center gap-2 border-b border-line px-4">
        <Lock size={11} className="text-[var(--security)]" />
        One-time code · {item.name}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {(failed || error) && (
          <p className="text-[12.5px] text-[var(--danger)]">{failed ?? error}</p>
        )}

        {payload === null ? (
          <div className="flex items-center gap-3">
            <code className="mono flex-1 select-none text-[22px] tracking-[0.3em] text-[var(--text-faint)]">
              ••• •••
            </code>
            <Button variant="primary" onClick={() => void onLoad()} disabled={busy}>
              <Eye size={13} /> {busy ? 'Decrypting…' : 'Show code'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <code className="num mono flex-1 text-[26px] tracking-[0.22em]">
                {code ? `${code.slice(0, 3)} ${code.slice(3)}` : '——— ———'}
              </code>
              <span
                className="mono text-[12px]"
                style={{ color: urgent ? 'var(--danger)' : 'var(--text-muted)' }}
              >
                {remaining}s
              </span>
            </div>

            {/* The bar is the countdown — a number alone does not read as urgency. */}
            <span className="block h-[3px] overflow-hidden rounded-sm bg-[var(--surface-active)]">
              <span
                className="block h-full rounded-sm transition-[width] duration-1000 ease-linear"
                style={{
                  width: `${(remaining / period) * 100}%`,
                  background: urgent ? 'var(--danger)' : 'var(--security)',
                }}
              />
            </span>

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => void onCopy(code)} disabled={!code}>
                {copied ? <Check size={13} /> : <Clipboard size={13} />}
                {copied ? `Copied — clears in ${copied}s` : 'Copy code'}
              </Button>
              {urgent && (
                <span className="text-[11.5px] text-[var(--danger)]">
                  Expiring — wait for the next one.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function VaultItemContext({ item }: { item: VaultRow }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={item.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Item">
        <DefinitionList
          rows={[
            ['Type', humanise(item.type)],
            ['Username', item.username ?? '—'],
            ['Rotation', item.rotateEveryD ? `every ${item.rotateEveryD} days` : 'None set'],
            ['Last rotated', item.lastRotatedAt ? timeAgo(item.lastRotatedAt) : '—'],
            ['Last viewed', item.lastViewedAt ? timeAgo(item.lastViewedAt) : 'Never'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Audit">
        <Link
          href="/settings/security"
          className="text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
        >
          Every reveal of this item is recorded →
        </Link>
      </PanelSection>

      <PanelDivider />
      <Timestamps created={item.createdAt} updated={item.updatedAt} />
    </div>
  );
}
