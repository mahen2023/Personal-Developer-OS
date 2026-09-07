'use client';

import Link from 'next/link';
import { BookOpen, Cpu, Lock, PlugZap, RefreshCw } from 'lucide-react';
import { cx } from '@/lib/format';
import type { AiSettings, Conversation, ModeDefinition, OllamaStatus } from '@/lib/intelligence';
import { Button } from '@/components/primitives';
import { PanelDivider, PanelSection, ProjectLink } from '@/components/patterns/DetailShell';
import { ProjectSelect } from '@/components/patterns/Form';

/**
 * The right panel (§16, §53).
 *
 * Its job is trust: at any moment you can see which engine will answer, which
 * model, in which mode, and exactly which of your records it is allowed to
 * read. Everything here is a control as well as a readout — the panel that
 * tells you what the context is, is the panel where you change it.
 */
export function ConsoleContext({
  status,
  settings,
  conversation,
  modes,
  selectableSources,
  onChange,
  onSwitchModel,
}: {
  status: OllamaStatus | null;
  settings: AiSettings | null;
  conversation: Conversation | null;
  modes: ModeDefinition[];
  selectableSources: string[];
  onChange: (patch: Partial<Conversation>) => void;
  onSwitchModel: () => void;
}) {
  const sources = conversation?.sources ?? [];
  // A project counts: attaching one is itself a decision to bring the workspace
  // into the conversation.
  const usingKnowledge = sources.length > 0 || Boolean(conversation?.projectId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Engine">
        <dl className="flex flex-col gap-[6px]">
          <Row label="Provider" value={settings?.provider ?? 'Ollama'} />
          <Row
            label="State"
            value={
              <span
                className={cx(
                  status?.state === 'ONLINE' ? 'text-[var(--success)]' : 'text-[var(--text-faint)]',
                )}
              >
                {status?.state.toLowerCase() ?? 'unknown'}
                {status?.placement === 'REMOTE' ? ' · remote' : ''}
              </span>
            }
          />
          <Row label="Endpoint" value={<span className="mono">{status?.endpoint ?? '—'}</span>} />
          {status?.version && <Row label="Version" value={status.version} />}
          {status?.latencyMs !== null && status?.latencyMs !== undefined && (
            <Row label="Latency" value={`${status.latencyMs} ms`} />
          )}
        </dl>
      </PanelSection>

      <PanelDivider />

      <PanelSection title="Model">
        <button
          onClick={onSwitchModel}
          className="flex w-full items-center gap-2 rounded border border-line bg-[var(--surface-raised)] px-[9px] py-[6px] text-left transition-colors hover:border-[var(--line-strong)]"
        >
          <Cpu size={12} className="shrink-0 text-[var(--text-faint)]" />
          <span className="mono min-w-0 flex-1 truncate text-[12px]">
            {conversation?.model || 'none selected'}
          </span>
          <span className="mono shrink-0 text-[10px] text-[var(--text-faint)]">⌘⇧M</span>
        </button>

        <div className="mt-2 flex flex-wrap gap-[4px]">
          {modes.map((mode) => (
            <button
              key={mode.mode}
              title={mode.hint}
              onClick={() => onChange({ mode: mode.mode })}
              className={cx(
                'rounded-sm border px-[7px] py-[3px] text-[11px] transition-colors',
                conversation?.mode === mode.mode
                  ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'border-line bg-[var(--surface-raised)] text-[var(--text-muted)] hover:border-[var(--line-strong)]',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection title="Project context">
        {conversation?.project ? (
          <ProjectLink project={conversation.project} />
        ) : (
          <p className="mb-2 text-[11.5px] text-[var(--text-faint)]">
            Nothing attached. With a project selected, questions are read as being about it.
          </p>
        )}
        <div className="mt-2">
          <ProjectSelect
            value={conversation?.projectId ?? null}
            onChange={(projectId) => onChange({ projectId })}
          />
        </div>
      </PanelSection>

      <PanelDivider />

      <PanelSection title="Workspace knowledge">
        {/* Off until asked for. Searching someone's notes to answer a question
            that never needed them is an unasked-for search of their workspace,
            and it makes every answer open by apologising for finding nothing
            relevant. Turning it on is one click and says exactly what it does. */}
        <button
          onClick={() =>
            onChange({
              sources: usingKnowledge
                ? []
                : (modes.find((mode) => mode.mode === conversation?.mode)?.defaultSources ??
                  selectableSources.slice(0, 4)),
            })
          }
          disabled={!conversation}
          className={cx(
            'flex w-full items-center gap-2 rounded border px-[9px] py-[7px] text-left transition-colors',
            usingKnowledge
              ? 'border-[var(--accent-line)] bg-[var(--accent-dim)]'
              : 'border-line bg-[var(--surface-raised)] hover:border-[var(--line-strong)]',
            !conversation && 'opacity-45',
          )}
        >
          <BookOpen
            size={12}
            className={cx(
              'shrink-0',
              usingKnowledge ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]',
            )}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cx(
                'block text-[12px]',
                usingKnowledge ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
              )}
            >
              {usingKnowledge ? 'Answering from your records' : 'Not using your records'}
            </span>
            <span className="block text-[10.5px] leading-tight text-[var(--text-faint)]">
              {usingKnowledge
                ? `${sources.length} source${sources.length === 1 ? '' : 's'} searched per question`
                : 'The model answers on its own. Click to open your workspace to it.'}
            </span>
          </span>
        </button>

        {usingKnowledge && (
          <div className="mt-2 flex flex-col gap-[2px]">
            {selectableSources.map((source) => {
              const on = sources.includes(source);
              return (
                <label
                  key={source}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-[2px] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        sources: on
                          ? sources.filter((item) => item !== source)
                          : [...sources, source],
                      })
                    }
                    className="h-[12px] w-[12px] accent-[var(--accent)]"
                  />
                  <span className="text-[11.5px] capitalize text-[var(--text-muted)]">
                    {source.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </PanelSection>

      <PanelDivider />

      <PanelSection title="Privacy">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-faint)]">
          <Lock size={11} className="mt-[2px] shrink-0 text-[var(--security)]" />
          {settings?.privateMode
            ? 'Every request goes to your own Ollama. No external AI provider is called, and vault secrets are never indexed or sent.'
            : 'Private mode is off. Turn it on in AI settings to guarantee local-only processing.'}
        </p>
        <p className="mono mt-2 text-[10.5px] text-[var(--text-faint)]">
          {usingKnowledge
            ? `index: ${settings?.indexEmbeddingModel ?? '—'} (${settings?.indexMatching ?? '—'})`
            : 'no records are being read in this conversation'}
        </p>
      </PanelSection>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[68px] shrink-0 text-[11px] text-[var(--text-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">{value}</dd>
    </div>
  );
}

/**
 * Shown across the transcript when the engine cannot be reached (§6, §45).
 *
 * Deliberately not a blocking screen: the conversation list, the transcripts
 * and every other part of the application still work with Ollama stopped (§46).
 * This says what is wrong and offers the two ways forward.
 */
export function EngineBanner({ status }: { status: OllamaStatus }) {
  return (
    <div className="mx-6 mt-5 rounded border border-line bg-[var(--surface-raised)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <PlugZap size={14} className="text-[var(--warning)]" />
        <span className="label">Ollama {status.state.toLowerCase()}</span>
        <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">
          {status.endpoint}
        </span>
      </div>

      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        {status.message ?? 'The local AI service could not be reached.'}
      </p>

      <ol className="mono mb-3 flex flex-col gap-[3px] text-[11px] text-[var(--text-faint)]">
        <li>1. Is Ollama running? Start it with `ollama serve`.</li>
        <li>2. Is the URL above the one it listens on?</li>
        <li>3. From a container, use host.docker.internal rather than localhost.</li>
      </ol>

      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw size={12} /> Retry
        </Button>
        <Link href="/settings/intelligence">
          <Button>Configure connection</Button>
        </Link>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
        Everything else in the workspace keeps working. Search and retrieval need no model —{' '}
        <Link href="/intelligence/retrieval" className="hover:text-[var(--accent)]">
          ask your records directly
        </Link>
        .
      </p>
    </div>
  );
}
