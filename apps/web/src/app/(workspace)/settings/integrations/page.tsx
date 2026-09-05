'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Plug, RefreshCw, TriangleAlert, Unplug } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useAction } from '@/hooks/useResource';
import { Button, StatusIndicator } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';
import { Field, FormError, TextInput } from '@/components/patterns/Form';

interface Connected {
  id: string;
  provider: string;
  account: string | null;
  scopes: string[];
  isEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface Available {
  id: string;
  label: string;
  does: string;
  tokenUrl: string;
  scopeHint: string;
}

interface Payload {
  connected: Connected[];
  available: Available[];
}

/**
 * Connections to the outside world (§8 of the phase list).
 *
 * Everything here is optional, and the screen is built to make that obvious:
 * nothing is pre-enabled, nothing nags, and the application is complete with
 * this page never visited. What it does refuse to do is imply more than it
 * has — only providers with a working client are listed, and a token is
 * checked with the provider before it is stored, so "connected" is a fact
 * rather than a hope.
 */
export default function IntegrationsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(await api<Payload>('/integrations').catch(() => null));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Plug}
        title="Integrations"
        subtitle="Optional. Every one of these can stay disconnected and nothing else changes."
      />

      <div className="flex flex-col gap-3">
        {(data?.available ?? []).map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            connection={data?.connected.find((row) => row.provider === provider.id) ?? null}
            open={opened === provider.id}
            onToggleOpen={() => setOpened(opened === provider.id ? null : provider.id)}
            onChanged={load}
          />
        ))}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Tokens are encrypted before they are stored, but unlike vault items the server can decrypt
        them — the nightly sync runs while nobody is signed in. Give each token the narrowest scope
        that works, and revoke it at the provider if this machine is ever lost.
      </p>
    </div>
  );
}

function ProviderCard({
  provider,
  connection,
  open,
  onToggleOpen,
  onChanged,
}: {
  provider: Available;
  connection: Connected | null;
  open: boolean;
  onToggleOpen: () => void;
  onChanged: () => Promise<void>;
}) {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const connect = useAction(() =>
    api('/integrations', { method: 'POST', body: { provider: provider.id, token } }),
  );
  const test = useAction(() =>
    api<{ ok: boolean; detail: string }>(`/integrations/${provider.id}/test`, { method: 'POST' }),
  );
  const sync = useAction(() =>
    api<{ updated: number; created: number; skipped: string[]; error?: string }>(
      `/integrations/${provider.id}/sync`,
      { method: 'POST' },
    ),
  );

  return (
    // Labelled so each provider is its own region: with three cards on screen
    // "the Connect button" is otherwise ambiguous to a screen reader as well.
    <section
      aria-label={provider.label}
      className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-[9px]">
        <span className="text-[13px] font-medium">{provider.label}</span>
        {connection ? (
          <StatusIndicator
            signal={connection.lastError ? 'danger' : connection.isEnabled ? 'success' : 'neutral'}
            label={
              connection.lastError
                ? 'failing'
                : connection.isEnabled
                  ? `connected as ${connection.account ?? 'unknown'}`
                  : 'paused'
            }
          />
        ) : (
          <span className="text-[11.5px] text-[var(--text-faint)]">not connected</span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {connection ? (
            <>
              <Button
                variant="ghost"
                disabled={sync.busy}
                onClick={async () => {
                  const result = await sync.run();
                  if (result) {
                    setMessage(
                      result.error
                        ? result.error
                        : `${result.updated} updated, ${result.created} created.` +
                            (result.skipped.length ? ` Skipped ${result.skipped.length}.` : ''),
                    );
                  }
                  await onChanged();
                }}
              >
                <RefreshCw size={12} className={cx(sync.busy && 'animate-spin')} />
                {sync.busy ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button
                variant="ghost"
                disabled={test.busy}
                onClick={async () => {
                  const result = await test.run();
                  if (result) setMessage(result.detail);
                  await onChanged();
                }}
              >
                Test
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Disconnect ${provider.label}? The stored token is deleted. Revoke it at the provider too if you no longer want it to exist.`,
                    )
                  ) {
                    return;
                  }
                  await api(`/integrations/${provider.id}`, { method: 'DELETE' });
                  setMessage(null);
                  await onChanged();
                }}
              >
                <Unplug size={12} /> Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={onToggleOpen}>{open ? 'Cancel' : 'Connect'}</Button>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">{provider.does}</p>

        {connection && (
          <dl className="mono flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--text-faint)]">
            <span>
              scopes: {connection.scopes.length > 0 ? connection.scopes.join(' ') : 'not reported'}
            </span>
            <span>
              last sync: {connection.lastSyncAt ? timeAgo(connection.lastSyncAt) : 'never'}
            </span>
          </dl>
        )}

        {connection?.lastError && (
          <p className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12px] text-[var(--danger)]">
            <TriangleAlert size={13} className="mt-[2px] shrink-0" />
            {connection.lastError}
          </p>
        )}

        {message && <p className="text-[12px] text-[var(--text-muted)]">{message}</p>}

        {open && !connection && (
          <form
            className="flex flex-col gap-2 border-t border-line pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await connect.run();
              if (saved) {
                // Out of memory the moment it is accepted; it is never read back.
                setToken('');
                onToggleOpen();
                await onChanged();
              }
            }}
          >
            <FormError error={connect.error} />
            <Field label="Access token" hint={provider.scopeHint}>
              <TextInput
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Pasted from the provider"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary" disabled={connect.busy || token.length < 8}>
                {connect.busy ? 'Checking with the provider…' : 'Connect'}
              </Button>
              <a
                href={provider.tokenUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-[12px] text-[var(--text-faint)] hover:text-[var(--accent)]"
              >
                Create a token <ExternalLink size={11} />
              </a>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
