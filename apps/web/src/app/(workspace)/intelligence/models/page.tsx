'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, Cpu, Download, Layers, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { type OllamaModel, type OllamaStatus, formatBytes, streamEvents } from '@/lib/intelligence';
import {
  Button,
  EmptyState,
  LoadingLine,
  ProgressBar,
  StatusIndicator,
} from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';

/**
 * Local model management (§26, §27).
 *
 * Ollama owns the models; this page is a view onto them plus the one thing
 * Ollama cannot know — how much each one has actually been used here. Nothing
 * on this screen happens implicitly: no model is ever pulled to satisfy a
 * request, and none is ever deleted to make room.
 */
export default function ModelsPage() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState<Pull | null>(null);
  const [name, setName] = useState('');
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const [catalogue, engine] = await Promise.all([
      api<OllamaModel[]>('/ai/ollama/models').catch(() => []),
      api<OllamaStatus>('/ai/ollama/status').catch(() => null),
    ]);
    setModels(catalogue);
    setStatus(engine);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pull(model: string) {
    const controller = new AbortController();
    abort.current = controller;
    setPulling({ model, status: 'starting', completed: 0, total: null });

    try {
      for await (const event of streamEvents('/ai/models/pull', { model }, controller.signal)) {
        if (event.type === 'progress') {
          setPulling({
            model,
            status: event.status,
            completed: event.completedBytes ?? 0,
            total: event.totalBytes,
          });
        } else if (event.type === 'error') {
          setPulling({ model, status: event.message, completed: 0, total: null, failed: true });
          return;
        }
      }
    } catch {
      // An abort is the cancel button; nothing to report.
    } finally {
      abort.current = null;
      if (!controller.signal.aborted) {
        setPulling(null);
        setName('');
        await refresh();
      } else {
        setPulling(null);
      }
    }
  }

  if (loading) return <LoadingLine message="Asking Ollama what is installed…" />;

  return (
    <div className="mx-auto max-w-[880px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Layers}
        title="Local models"
        subtitle="What this machine can run, and how much you have used it."
        count={models.length}
        actions={
          <Button onClick={() => void refresh()}>
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3 rounded border border-line bg-[var(--surface-raised)] px-4 py-[9px]">
        <StatusIndicator
          signal={status?.state === 'ONLINE' ? 'success' : 'neutral'}
          label={status?.state === 'ONLINE' ? 'Connected' : 'Offline'}
          pulse={status?.state === 'ONLINE'}
        />
        <span className="mono text-[11px] text-[var(--text-faint)]">{status?.endpoint}</span>
        {status?.version && (
          <span className="mono text-[11px] text-[var(--text-faint)]">v{status.version}</span>
        )}
        <Link
          href="/settings/intelligence"
          className="mono ml-auto text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)]"
        >
          settings
        </Link>
      </div>

      {/* Pull. Deliberately below the list: adding a model is the rare action. */}
      <section className="mb-4 overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        <div className="label flex h-8 items-center border-b border-line px-4">Pull a model</div>
        <div className="flex items-center gap-2 p-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="qwen3:14b"
            disabled={Boolean(pulling)}
            className="mono h-[30px] flex-1 rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] outline-none focus:border-[var(--accent-line)]"
          />
          <Button
            variant="primary"
            disabled={!name.trim() || Boolean(pulling)}
            onClick={() => void pull(name.trim())}
          >
            <Download size={13} /> Pull
          </Button>
        </div>

        {pulling && (
          <div className="border-t border-line p-3">
            <div className="mb-[6px] flex items-center gap-2">
              <span className="mono text-[12px]">{pulling.model}</span>
              <span
                className={cx(
                  'mono text-[11px]',
                  pulling.failed ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]',
                )}
              >
                {pulling.status}
              </span>
              <button
                onClick={() => abort.current?.abort()}
                className="mono ml-auto flex items-center gap-1 text-[11px] text-[var(--text-faint)] hover:text-[var(--danger)]"
              >
                <X size={11} /> cancel
              </button>
            </div>

            {pulling.total ? (
              <>
                <ProgressBar value={Math.round((pulling.completed / pulling.total) * 100)} />
                <p className="mono mt-[5px] text-[10.5px] text-[var(--text-faint)]">
                  {formatBytes(pulling.completed)} / {formatBytes(pulling.total)}
                </p>
              </>
            ) : (
              <p className="mono text-[10.5px] text-[var(--text-faint)]">
                waiting for the size from the registry…
              </p>
            )}

            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
              The download runs inside Ollama. Leaving this page abandons the progress view, not the
              download.
            </p>
          </div>
        )}
      </section>

      {models.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title={status?.state === 'ONLINE' ? 'No models installed' : 'Ollama is not answering'}
          description={
            status?.state === 'ONLINE'
              ? 'Ollama is running but has nothing pulled yet. A small general model such as llama3.1:8b is a reasonable place to start.'
              : 'Start Ollama, or point the console at the machine that runs it.'
          }
          connects={['chat models for the console', 'nomic-embed-text for semantic search']}
        />
      ) : (
        <ul className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          {models.map((model) => (
            <li
              key={model.name}
              className="flex items-center gap-3 border-b border-line px-4 py-[9px] last:border-b-0"
            >
              <span
                aria-hidden
                className={cx(
                  'h-[6px] w-[6px] shrink-0 rounded-full',
                  model.loaded ? 'bg-[var(--success)]' : 'bg-[var(--line-strong)]',
                )}
                title={model.loaded ? 'Loaded in memory' : 'On disk'}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="mono truncate text-[12.5px]">{model.name}</span>
                  {model.isDefault && (
                    <span className="mono rounded-sm border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[5px] text-[10px] text-[var(--accent)]">
                      default
                    </span>
                  )}
                </div>
                <div className="mono mt-[2px] flex flex-wrap gap-x-3 text-[10.5px] text-[var(--text-faint)]">
                  {/* Only what Ollama actually reported — §5 forbids a guess. */}
                  {model.parameterSize && <span>{model.parameterSize}</span>}
                  {model.quantization && <span>{model.quantization}</span>}
                  <span>{formatBytes(model.sizeBytes)}</span>
                  <span>
                    used {model.useCount}×{model.lastUsedAt ? `, ${timeAgo(model.lastUsedAt)}` : ''}
                  </span>
                </div>
              </div>

              <button
                onClick={async () => {
                  await api('/ai/settings', {
                    method: 'PATCH',
                    body: { chatModel: model.name },
                  }).catch(() => undefined);
                  await refresh();
                }}
                title="Use as the default model"
                className="mono flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
              >
                <CircleCheck size={11} /> default
              </button>

              <button
                onClick={async () => {
                  // Typed confirmation, because this frees gigabytes and the
                  // only way back is a download (§26).
                  const answer = window.prompt(
                    `Delete ${model.name} from Ollama? This removes the weights from disk; conversations that used it are untouched.\n\nType the model name to confirm:`,
                  );
                  if (answer !== model.name) return;
                  await api(`/ai/models/${encodeURIComponent(model.name)}`, {
                    method: 'DELETE',
                  }).catch(() => undefined);
                  await refresh();
                }}
                title="Delete from disk"
                aria-label={`Delete ${model.name}`}
                className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
        Models are stored by Ollama, not by this application — deleting one here deletes the
        weights, and nothing else. A conversation records which model answered it, and keeps saying
        so afterwards.
      </p>
    </div>
  );
}

interface Pull {
  model: string;
  status: string;
  completed: number;
  total: number | null;
  failed?: boolean;
}
