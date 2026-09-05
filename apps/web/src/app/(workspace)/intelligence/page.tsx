'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  Cpu,
  Layers,
  Lock,
  MessageSquarePlus,
  Pin,
  Search,
  Settings2,
  Telescope,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import {
  type Conversation,
  type ModeDefinition,
  type OllamaModel,
  type OllamaStatus,
  type Providers,
} from '@/lib/intelligence';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Button, KeyHint, LoadingLine, StatusIndicator } from '@/components/primitives';
import { Composer, ModelSwitcher } from './Composer';
import { Transcript } from './Transcript';
import { useConsole } from './useConsole';
import { ConsoleContext, EngineBanner } from './ConsoleContext';
import { AttachPicker } from './AttachPicker';

/**
 * The Developer Intelligence console (§7, §66).
 *
 * Three areas, as §8 asks: conversations on the left, the transcript in the
 * middle, and context on the right — the last of which is the workspace's own
 * context panel rather than a third column of its own, so it collapses with
 * the same key as every other panel in the application and the console does not
 * invent a second way to hide something.
 *
 * The whole screen is deliberately not a chat client. It fills the viewport
 * like a terminal, scrolls only in the transcript, and puts the machine state —
 * engine, model, mode, private — on permanent display. You should be able to
 * tell at a glance what is about to answer you and what it can see.
 */
export default function IntelligenceConsolePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [filter, setFilter] = useState('recent');
  const [query, setQuery] = useState('');
  const [switching, setSwitching] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [booted, setBooted] = useState(false);

  const console_ = useConsole(activeId);

  const loadConversations = useCallback(async () => {
    const page = await api<{ items: Conversation[] }>(
      `/ai/conversations?filter=${filter}&limit=50${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`,
    ).catch(() => ({ items: [] }));
    setConversations(page.items);
    return page.items;
  }, [filter, query]);

  // The engine is asked once on arrival, not polled. A console that pings a
  // local server every few seconds is a console that keeps a GPU awake.
  useEffect(() => {
    void (async () => {
      const [engine, catalogue, meta, list] = await Promise.all([
        api<OllamaStatus>('/ai/ollama/status').catch(() => null),
        api<OllamaModel[]>('/ai/ollama/models').catch(() => []),
        api<Providers>('/ai/providers').catch(() => null),
        loadConversations(),
      ]);
      setStatus(engine);
      setModels(catalogue);
      setProviders(meta);
      setActiveId((current) => current ?? list[0]?.id ?? null);
      setBooted(true);
    })();
    // Only on mount: the filter effect below handles every later list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (booted) void loadConversations();
  }, [booted, loadConversations]);

  // Memoised because `runCommand` depends on it: a fresh [] every render would
  // rebuild the command handler, and with it the key listener, on every token.
  const modes: ModeDefinition[] = useMemo(() => providers?.modes ?? [], [providers]);

  const startConversation = useCallback(
    async (seed?: Partial<Conversation>) => {
      const created = await api<Conversation>('/ai/conversations', {
        method: 'POST',
        body: {
          model: seed?.model ?? status?.chatModel ?? models[0]?.name,
          mode: seed?.mode,
          projectId: seed?.projectId ?? null,
        },
      }).catch(() => null);
      if (!created) return null;
      setConversations((current) => [created, ...current]);
      setActiveId(created.id);
      return created;
    },
    [models, status?.chatModel],
  );

  /** Sending with no conversation open creates one, so the first ask just works. */
  const send = useCallback(
    async (text: string) => {
      if (!activeId) {
        const created = await startConversation();
        if (!created) return;
        // The hook is keyed on the id, so the send waits for it to be current.
        window.setTimeout(() => void console_.send(text), 0);
        return;
      }
      await console_.send(text);
      await loadConversations();
    },
    [activeId, console_, loadConversations, startConversation],
  );

  const runCommand = useCallback(
    async (command: string, argument: string) => {
      if (command === '/new') {
        await startConversation();
      } else if (command === '/model') {
        if (argument) await console_.update({ model: argument });
        else setSwitching(true);
      } else if (command === '/mode') {
        const match = modes.find(
          (mode) =>
            mode.label.toLowerCase() === argument.toLowerCase() ||
            mode.mode === argument.toUpperCase(),
        );
        if (match) await console_.update({ mode: match.mode });
      } else if (command === '/clear') {
        if (activeId) {
          await api(`/ai/conversations/${activeId}`, { method: 'DELETE' }).catch(() => undefined);
          setActiveId(null);
          await loadConversations();
        }
      } else if (command === '/search') {
        window.location.href = `/intelligence/retrieval?q=${encodeURIComponent(argument)}`;
      } else if (command === '/context') {
        // Nothing to run: the panel already shows it. Saying so beats silence.
        window.alert(
          'The context panel on the right lists everything the assistant can see for this conversation.',
        );
      }
    },
    [activeId, console_, loadConversations, modes, startConversation],
  );

  // §52. Registered here rather than in the global layer because they only
  // mean anything on this screen, and Escape must not steal from a dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.shiftKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setSwitching(true);
      }
      if (event.key === 'Escape' && console_.streaming) {
        event.preventDefault();
        console_.stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [console_]);

  const attachments = useMemo(
    () =>
      (console_.conversation?.attached ?? []).map((ref) => ({
        ref,
        label: ref.split(':')[0].replace(/_/g, ' ').toLowerCase(),
      })),
    [console_.conversation?.attached],
  );

  useContextPanel(
    'Console',
    <ConsoleContext
      status={status}
      settings={providers?.settings ?? null}
      conversation={console_.conversation}
      modes={modes}
      selectableSources={providers?.sources ?? []}
      onChange={console_.update}
      onSwitchModel={() => setSwitching(true)}
    />,
    [status, providers, console_.conversation, console_.messages.length],
  );

  if (!booted) return <LoadingLine message="Reaching the local engine…" />;

  return (
    <div className="flex h-[calc(100vh-var(--topbar-h)-var(--statusbar-h))] min-h-0">
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line bg-[var(--surface-sunken)] md:flex">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="label flex-1">Conversations</span>
          <button
            onClick={() => void startConversation()}
            title="New conversation"
            aria-label="New conversation"
            className="text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
          >
            <MessageSquarePlus size={13} />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-line px-2 py-[5px]">
          <Search size={11} className="text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[11.5px] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>

        <div className="flex gap-[3px] border-b border-line px-2 py-[5px]">
          {['recent', 'pinned', 'archived', 'all'].map((option) => (
            <button
              key={option}
              onClick={() => setFilter(option)}
              className={cx(
                'rounded-sm px-[6px] py-[2px] text-[10.5px] capitalize transition-colors',
                filter === option
                  ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <li className="px-3 py-4 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
              Nothing here yet. Ask something below and this fills in.
            </li>
          )}
          {conversations.map((row) => (
            <li key={row.id}>
              <button
                onClick={() => setActiveId(row.id)}
                className={cx(
                  'group flex w-full flex-col gap-[2px] border-b border-line px-3 py-[7px] text-left transition-colors',
                  row.id === activeId
                    ? 'bg-[var(--surface-hover)]'
                    : 'hover:bg-[var(--surface-hover)]',
                )}
              >
                <span className="flex w-full items-center gap-[5px]">
                  {row.isPinned && <Pin size={9} className="shrink-0 text-[var(--accent)]" />}
                  {row.isArchived && (
                    <Archive size={9} className="shrink-0 text-[var(--text-faint)]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px]">{row.title}</span>
                </span>
                <span className="mono flex w-full items-center gap-2 text-[10px] text-[var(--text-faint)]">
                  <span className="truncate">{row.model}</span>
                  <span className="ml-auto shrink-0">
                    {timeAgo(row.lastMessageAt ?? row.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-line px-3 py-[7px]">
          <Link
            href="/intelligence/models"
            className="mono flex items-center gap-[6px] text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
          >
            <Layers size={11} /> models
          </Link>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-4">
          <Telescope size={13} className="text-[var(--text-faint)]" />
          <h1 className="truncate text-[12.5px] font-medium">
            {console_.conversation?.title ?? 'Developer Intelligence'}
          </h1>

          {console_.conversation && (
            <>
              <button
                onClick={() => void console_.update({ isPinned: !console_.conversation?.isPinned })}
                title={console_.conversation.isPinned ? 'Unpin' : 'Pin'}
                className={cx(
                  'shrink-0 transition-colors',
                  console_.conversation.isPinned
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--accent)]',
                )}
              >
                <Pin size={12} />
              </button>
              <button
                onClick={() =>
                  void console_.update({ isArchived: !console_.conversation?.isArchived })
                }
                title={console_.conversation.isArchived ? 'Unarchive' : 'Archive'}
                className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
              >
                <Archive size={12} />
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm('Delete this conversation? The transcript goes with it.'))
                    return;
                  await api(`/ai/conversations/${console_.conversation?.id}`, {
                    method: 'DELETE',
                  }).catch(() => undefined);
                  setActiveId(null);
                  await loadConversations();
                }}
                title="Delete"
                className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-3">
            {providers?.settings.privateMode && (
              <span
                className="mono flex items-center gap-[5px] text-[10.5px] text-[var(--security)]"
                title="All processing runs through your own Ollama. No external AI provider is called."
              >
                <Lock size={10} /> private
              </span>
            )}
            <StatusIndicator
              signal={
                status?.state === 'ONLINE'
                  ? 'success'
                  : status?.state === 'ERROR'
                    ? 'danger'
                    : 'neutral'
              }
              label={
                status?.state === 'ONLINE'
                  ? `Ollama ${status.placement.toLowerCase()}`
                  : 'Ollama offline'
              }
              pulse={status?.state === 'ONLINE'}
            />
            <Link
              href="/settings/intelligence"
              title="AI settings"
              className="text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
            >
              <Settings2 size={13} />
            </Link>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status && status.state !== 'ONLINE' && <EngineBanner status={status} />}

          {console_.loading ? (
            <LoadingLine message="Loading the conversation…" />
          ) : console_.messages.length === 0 && !console_.pending ? (
            <Welcome
              conversations={conversations}
              models={models}
              onPick={setActiveId}
              onNew={() => void startConversation()}
            />
          ) : (
            <Transcript
              messages={console_.messages}
              pending={console_.pending}
              error={console_.error}
              hasMore={console_.hasMore}
              projectId={console_.conversation?.projectId ?? null}
              onLoadOlder={() => void console_.loadOlder()}
              onRegenerate={(message) => {
                const question = [...console_.messages]
                  .reverse()
                  .find((row) => row.role === 'USER' && row.createdAt < message.createdAt);
                if (question) void console_.send(question.content, { regenerate: true });
              }}
              onRetry={() => console_.dismissError()}
              onAsk={(question) => void send(question)}
            />
          )}
        </div>

        <Composer
          conversation={console_.conversation}
          models={models}
          modes={modes}
          streaming={console_.streaming}
          attachments={attachments}
          onSend={(text) => void send(text)}
          onStop={console_.stop}
          onCommand={(command, argument) => void runCommand(command, argument)}
          onDetach={(ref) =>
            void console_.update({
              attached: (console_.conversation?.attached ?? []).filter((item) => item !== ref),
            })
          }
          onAttach={() => setAttaching(true)}
        />
      </main>

      {attaching && (
        <AttachPicker
          attached={console_.conversation?.attached ?? []}
          onAttach={async (ref) => {
            // Attaching before a conversation exists would have nowhere to go,
            // so the conversation is created first and then updated.
            const target = console_.conversation ?? (await startConversation());
            if (!target) return;
            await console_.update({ attached: [...(target.attached ?? []), ref] });
          }}
          onClose={() => setAttaching(false)}
        />
      )}

      {switching && (
        <ModelSwitcher
          models={models}
          current={console_.conversation?.model ?? null}
          onPick={(model) => void console_.update({ model })}
          onClose={() => setSwitching(false)}
        />
      )}
    </div>
  );
}

/**
 * The empty console (§66).
 *
 * Not a marketing panel and not "No data found" — it says what this screen is
 * for, shows what is loaded, and puts recent work one click away.
 */
function Welcome({
  conversations,
  models,
  onPick,
  onNew,
}: {
  conversations: Conversation[];
  models: OllamaModel[];
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-6 px-6 py-12">
      <div>
        <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.01em]">
          What are you working on?
        </h2>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Your own notes, solutions, decisions and infrastructure are available when the answer
          needs them. Every claim drawn from them names the record it came from.
        </p>
      </div>

      <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-faint)]">
        <span className="flex items-center gap-[5px]">
          <Cpu size={11} /> {models.length} model{models.length === 1 ? '' : 's'} installed
        </span>
        <span className="flex items-center gap-[5px]">
          <Lock size={11} /> nothing leaves this machine
        </span>
      </div>

      {conversations.length > 0 && (
        <section>
          <div className="label mb-2">Recent</div>
          <ul className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
            {conversations.slice(0, 5).map((row) => (
              <li key={row.id}>
                <button
                  onClick={() => onPick(row.id)}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-[7px] text-left transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.title}</span>
                  <span className="mono shrink-0 text-[10.5px] text-[var(--text-faint)]">
                    {timeAgo(row.lastMessageAt ?? row.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={onNew}>
          <MessageSquarePlus size={13} /> New conversation
        </Button>
        <span className="mono flex items-center gap-2 text-[10.5px] text-[var(--text-faint)]">
          or just type below <KeyHint keys={['↵']} />
        </span>
      </div>
    </div>
  );
}
