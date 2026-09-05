'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Cpu, Lock, PlugZap, Sparkles, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '@/lib/format';
import type { AiSettings, ModeDefinition, OllamaStatus, Providers } from '@/lib/intelligence';
import { Button, LoadingLine, StatusIndicator } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';

/**
 * AI settings, and the setup assistant (§56, §57).
 *
 * One screen rather than two: a wizard that disappears once it has been used is
 * a screen nobody can find again when the server moves. The steps are the
 * sections, and each shows whether it is satisfied — which makes the same page
 * work as first-run setup and as the place you come back to.
 */
export default function IntelligenceSettingsPage() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [modes, setModes] = useState<ModeDefinition[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [meta, engine] = await Promise.all([
      api<Providers>('/ai/providers').catch(() => null),
      api<OllamaStatus>('/ai/ollama/status').catch(() => null),
    ]);
    if (meta) {
      setSettings(meta.settings);
      setModes(meta.modes);
      setUrl(meta.settings.endpoint);
    }
    setStatus(engine);
    if (engine?.state === 'ONLINE') {
      const catalogue = await api<{ name: string }[]>('/ai/ollama/models').catch(() => []);
      setModels(catalogue.map((model) => model.name));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The update shape is not the read shape: `baseUrl` is written, `endpoint`
  // is what comes back — the effective value, which may come from .env.
  async function patch(body: {
    baseUrl?: string | null;
    chatModel?: string | null;
    embeddingModel?: string | null;
    defaultMode?: AiSettings['defaultMode'];
    temperature?: number | null;
    privateMode?: boolean;
    retainMessages?: boolean;
  }) {
    const updated = await api<AiSettings>('/ai/settings', { method: 'PATCH', body }).catch(
      () => null,
    );
    if (!updated) return;
    setSettings(updated);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
    await load();
  }

  if (!settings) return <LoadingLine message="Loading AI settings…" />;

  const connected = status?.state === 'ONLINE';
  const modelReady = Boolean(settings.chatModel && models.includes(settings.chatModel));

  return (
    <div className="mx-auto max-w-[720px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Sparkles}
        title="Local AI"
        subtitle="The console runs on your own Ollama. Nothing here calls an outside service."
      />

      <Step
        index={1}
        title="Connect to Ollama"
        done={connected}
        detail={connected ? `Reached in ${status?.latencyMs} ms` : 'Not reachable yet'}
      >
        <label className="mb-2 flex flex-col gap-[5px]">
          <span className="label">Ollama URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="http://localhost:11434"
            className="mono h-[30px] rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] outline-none focus:border-[var(--accent-line)]"
          />
        </label>

        <p className="mb-3 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          Currently taken from{' '}
          {settings.endpointSource === 'settings' ? 'this screen' : 'OLLAMA_BASE_URL in .env'}.
          Running the app in Docker? `localhost` there is the container — use
          <span className="mono"> http://host.docker.internal:11434</span>, or the address of the
          machine that runs Ollama.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              setTested(null);
              const result = await api<OllamaStatus & { models: string[] }>('/ai/ollama/test', {
                method: 'POST',
                body: { baseUrl: url.trim() || undefined },
              }).catch(() => null);
              setTesting(false);
              if (!result) {
                setTested({ ok: false, message: 'The test could not be run.' });
                return;
              }
              setTested({
                ok: result.state === 'ONLINE',
                message:
                  result.state === 'ONLINE'
                    ? `Ollama ${result.version ?? ''} answered, with ${result.models.length} model${result.models.length === 1 ? '' : 's'} installed.`
                    : (result.message ?? 'No answer.'),
              });
              if (result.state === 'ONLINE') setModels(result.models);
            }}
          >
            <PlugZap size={13} /> {testing ? 'Testing…' : 'Test connection'}
          </Button>

          <Button variant="primary" onClick={() => void patch({ baseUrl: url.trim() || null })}>
            Save URL
          </Button>

          {tested && (
            <span
              className={cx(
                'text-[11.5px]',
                tested.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]',
              )}
            >
              {tested.message}
            </span>
          )}
        </div>
      </Step>

      <Step
        index={2}
        title="Choose a model"
        done={modelReady}
        detail={
          settings.chatModel
            ? modelReady
              ? settings.chatModel
              : `${settings.chatModel} is not installed`
            : 'None chosen'
        }
      >
        {!connected ? (
          <p className="text-[12px] text-[var(--text-faint)]">
            Connect to Ollama first — the model list comes from the server, never from a guess.
          </p>
        ) : models.length === 0 ? (
          <p className="text-[12px] text-[var(--text-faint)]">
            Ollama is running but has nothing pulled.{' '}
            <Link href="/intelligence/models" className="text-[var(--accent)] hover:underline">
              Pull a model
            </Link>
            .
          </p>
        ) : (
          <>
            {settings.chatModel && !modelReady && (
              <p className="mb-2 flex items-center gap-2 text-[11.5px] text-[var(--warning)]">
                <TriangleAlert size={12} /> The saved default is no longer installed. Choose
                another.
              </p>
            )}
            <div className="flex flex-wrap gap-[5px]">
              {models.map((model) => (
                <button
                  key={model}
                  onClick={() => void patch({ chatModel: model })}
                  className={cx(
                    'mono rounded-sm border px-[9px] py-[4px] text-[11.5px] transition-colors',
                    settings.chatModel === model
                      ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                      : 'border-line bg-[var(--surface-raised)] hover:border-[var(--line-strong)]',
                  )}
                >
                  {model}
                </button>
              ))}
            </div>
          </>
        )}
      </Step>

      <Step
        index={3}
        title="How it answers by default"
        done
        detail={modes.find((mode) => mode.mode === settings.defaultMode)?.label ?? '—'}
      >
        <div className="mb-3 flex flex-wrap gap-[5px]">
          {modes.map((mode) => (
            <button
              key={mode.mode}
              title={mode.hint}
              onClick={() => void patch({ defaultMode: mode.mode })}
              className={cx(
                'rounded-sm border px-[9px] py-[4px] text-[11.5px] transition-colors',
                settings.defaultMode === mode.mode
                  ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-line bg-[var(--surface-raised)] hover:border-[var(--line-strong)]',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-3">
          <span className="label w-[92px]">Temperature</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={settings.temperature ?? 0.4}
            onChange={(event) => void patch({ temperature: Number(event.target.value) })}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="mono w-[30px] text-right text-[11.5px]">
            {(settings.temperature ?? 0.4).toFixed(1)}
          </span>
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Lower is more literal. For questions about your own records, low is usually right.
        </p>
      </Step>

      <Step
        index={4}
        title="Privacy"
        done={settings.privateMode}
        detail={settings.privateMode ? 'Local only' : 'Off'}
      >
        <Toggle
          label="Private mode"
          hint="Only local Ollama is called. No external AI provider, ever."
          value={settings.privateMode}
          onChange={(value) => void patch({ privateMode: value })}
        />
        <Toggle
          label="Keep transcripts"
          hint="Off means nothing is written to the database — conversations live only in this tab."
          value={settings.retainMessages}
          onChange={(value) => void patch({ retainMessages: value })}
        />

        <div className="mt-3 flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--security)_30%,transparent)] bg-[color-mix(in_srgb,var(--security)_8%,transparent)] px-3 py-2">
          <Lock size={12} className="mt-[2px] shrink-0 text-[var(--security)]" />
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            Vault items are never indexed and never sent to a model. The assistant can say that a
            credential exists and where it is filed; it cannot read one, and neither can the server
            without your master password.
          </p>
        </div>
      </Step>

      <section className="mt-5 rounded border border-line bg-[var(--surface-raised)] p-4">
        <div className="label mb-2">Search index</div>
        <dl className="mono flex flex-col gap-[4px] text-[11.5px] text-[var(--text-muted)]">
          <div className="flex gap-2">
            <dt className="w-[110px] text-[var(--text-faint)]">embedding model</dt>
            <dd>{settings.indexEmbeddingModel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-[110px] text-[var(--text-faint)]">matching</dt>
            <dd>{settings.indexMatching}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          {settings.indexMatching === 'lexical'
            ? 'Retrieval currently matches words, not meaning. For semantic search, pull nomic-embed-text and set EMBEDDING_PROVIDER=ollama — then rebuild the index, because the two kinds of vector are not comparable.'
            : 'Retrieval matches meaning. Changing the embedding model requires a full rebuild of the index.'}{' '}
          <Link href="/intelligence/retrieval" className="hover:text-[var(--accent)]">
            Index status
          </Link>
        </p>
      </section>

      <div className="mt-4 flex items-center gap-3">
        <StatusIndicator
          signal={connected && modelReady ? 'success' : 'warning'}
          label={
            connected && modelReady
              ? 'Ready — the console will answer'
              : 'Not ready — finish the steps above'
          }
          pulse={connected && modelReady}
        />
        {saved && (
          <span className="mono flex items-center gap-1 text-[11px] text-[var(--success)]">
            <Check size={11} /> saved
          </span>
        )}
        <Link href="/intelligence" className="ml-auto">
          <Button variant="primary">
            <Cpu size={13} /> Open the console
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  done,
  detail,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-[9px]">
        <span
          className={cx(
            'mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px]',
            done
              ? 'border-[var(--success)] text-[var(--success)]'
              : 'border-line text-[var(--text-faint)]',
          )}
        >
          {done ? <Check size={10} /> : index}
        </span>
        <h2 className="text-[12.5px] font-medium">{title}</h2>
        <span className="mono ml-auto truncate text-[11px] text-[var(--text-faint)]">{detail}</span>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-[5px]">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[2px] h-[13px] w-[13px] accent-[var(--accent)]"
      />
      <span>
        <span className="block text-[12.5px]">{label}</span>
        <span className="block text-[11px] leading-relaxed text-[var(--text-faint)]">{hint}</span>
      </span>
    </label>
  );
}
