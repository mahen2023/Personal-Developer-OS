'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookmarkPlus,
  ChevronUp,
  CircleDashed,
  PenLine,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx, clockTime } from '@/lib/format';
import { type AiMessage, type AiSource, formatDuration, sourceLabel } from '@/lib/intelligence';
import { Button } from '@/components/primitives';
import { Markdown, CopyButton } from '@/components/patterns/Markdown';
import type { ConsoleError, Pending } from './useConsole';

/**
 * The conversation itself (§48).
 *
 * Not chat bubbles. A turn is a labelled block with a hairline above it, the
 * way a terminal session or a technical record reads — the speaker is a small
 * tracked label, the content is prose at reading width, and the machine
 * details sit in a footer in monospace. Nothing is in a rounded card, nothing
 * has an avatar, and the two speakers are told apart by typography rather than
 * by alignment or colour.
 */
export function Transcript({
  messages,
  pending,
  error,
  hasMore,
  onLoadOlder,
  onRegenerate,
  onEdit,
  onRetry,
  onAsk,
  projectId,
}: {
  messages: AiMessage[];
  pending: Pending | null;
  error: ConsoleError | null;
  hasMore: boolean;
  onLoadOlder: () => void;
  onRegenerate: (message: AiMessage) => void;
  onEdit: (message: AiMessage, text: string) => void;
  onRetry: () => void;
  onAsk: (question: string) => void;
  projectId: string | null;
}) {
  const bottom = useRef<HTMLDivElement>(null);

  // Follows the stream. `auto` rather than `smooth`: at 40 tokens a second a
  // smooth scroll never arrives before the next one starts.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pending?.answer]);

  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      {hasMore && (
        <button
          onClick={onLoadOlder}
          className="mono mx-auto flex items-center gap-1 text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
        >
          <ChevronUp size={11} /> earlier turns
        </button>
      )}

      {messages.map((message) =>
        message.role === 'SYSTEM' ? (
          <SystemMarker key={message.id} content={message.content} />
        ) : (
          <Turn
            key={message.id}
            message={message}
            onRegenerate={() => onRegenerate(message)}
            onEdit={(text) => onEdit(message, text)}
            onAsk={onAsk}
            projectId={projectId}
          />
        ),
      )}

      {pending && <Streaming pending={pending} />}

      {error && <Failure error={error} onRetry={onRetry} />}

      <div ref={bottom} />
    </div>
  );
}

/** §54: a model change is a line in the thread, not a dialog. */
function SystemMarker({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-[var(--line)]" />
      <span className="mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-faint)]">
        {content}
      </span>
      <span className="h-px flex-1 bg-[var(--line)]" />
    </div>
  );
}

function Turn({
  message,
  onRegenerate,
  onEdit,
  onAsk,
  projectId,
}: {
  message: AiMessage;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onAsk: (question: string) => void;
  projectId: string | null;
}) {
  const isUser = message.role === 'USER';
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const [editing, setEditing] = useState(false);

  return (
    <article className="anim-enter">
      <header className="mb-[6px] flex items-baseline gap-2 border-b border-line pb-[5px]">
        <h2 className="label text-[var(--text-muted)]">
          {isUser ? 'You' : (message.model ?? 'Assistant')}
        </h2>
        <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">
          {clockTime(message.createdAt)}
        </span>
      </header>

      {isUser ? (
        editing ? (
          <EditQuestion
            initial={message.content}
            onCancel={() => setEditing(false)}
            onSave={(text) => {
              setEditing(false);
              onEdit(text);
            }}
          />
        ) : (
          <div className="group">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">
              {message.content}
            </p>
            {/* Revealed on hover: editing a question is deliberate, and a button
                on every turn would compete with the answers for attention. */}
            <div className="mt-[5px] opacity-0 transition-opacity duration-[var(--fast)] focus-within:opacity-100 group-hover:opacity-100">
              <Action icon={PenLine} label="Edit and resend" onClick={() => setEditing(true)} />
            </div>
          </div>
        )
      ) : (
        <>
          <Markdown>{message.content}</Markdown>
          {sources.length > 0 && <Sources sources={sources} />}
          <Footer
            message={message}
            onRegenerate={onRegenerate}
            onAsk={onAsk}
            projectId={projectId}
          />
        </>
      )}
    </article>
  );
}

/**
 * The answer as it arrives (§12).
 *
 * The sources render before the first token, because they are known before the
 * model has read its prompt — on a cold model that is several seconds where
 * the screen would otherwise say nothing at all.
 */
function Streaming({ pending }: { pending: Pending }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - pending.startedAt), 200);
    return () => window.clearInterval(timer);
  }, [pending.startedAt]);

  return (
    <>
      <article className="anim-enter">
        <header className="mb-[6px] flex items-baseline gap-2 border-b border-line pb-[5px]">
          <h2 className="label text-[var(--text-muted)]">You</h2>
        </header>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">
          {pending.question}
        </p>
      </article>

      <article>
        <header className="mb-[6px] flex items-baseline gap-2 border-b border-line pb-[5px]">
          <h2 className="label text-[var(--text-muted)]">{pending.model}</h2>
          <span className="mono ml-auto flex items-center gap-[6px] text-[10.5px] text-[var(--text-faint)]">
            <CircleDashed
              size={10}
              className="animate-spin"
              style={{ animationDuration: '2.4s' }}
            />
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </header>

        {pending.sources.length > 0 && <Sources sources={pending.sources} />}

        {pending.answer ? (
          <Markdown>{pending.answer}</Markdown>
        ) : (
          <p className="mono text-[11.5px] text-[var(--text-faint)]">
            reading context
            <span style={{ animation: 'caret 1.1s step-end infinite' }}>_</span>
          </p>
        )}
      </article>
    </>
  );
}

/**
 * Where the answer came from (§21, §62).
 *
 * Ranked, numbered to match the citations in the text, and every one a link to
 * the record itself. An assistant that cannot be checked is a rumour.
 */
function Sources({ sources }: { sources: AiSource[] }) {
  return (
    <section className="mb-3 mt-1 overflow-hidden rounded border border-line bg-[var(--surface-sunken)]">
      <div className="label flex h-7 items-center gap-2 border-b border-line px-3">
        Sources
        <span className="mono text-[10px] normal-case tracking-normal text-[var(--text-faint)]">
          {sources.length}
        </span>
      </div>
      <ul>
        {sources.map((source) => (
          <li key={`${source.entityType}-${source.entityId}-${source.index}`}>
            <Link
              href={source.href}
              className="flex items-center gap-2 border-b border-line px-3 py-[6px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
            >
              <span className="mono w-[18px] shrink-0 text-[10.5px] text-[var(--text-faint)]">
                {source.index}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px]">{source.title}</span>
              <span className="mono shrink-0 text-[10.5px] text-[var(--text-faint)]">
                {source.pinned ? 'attached' : sourceLabel(source.entityType)}
              </span>
              {!source.pinned && (
                <span
                  className="mono w-[34px] shrink-0 text-right text-[10.5px] text-[var(--text-faint)]"
                  title="Similarity to the question"
                >
                  {source.score.toFixed(2)}
                </span>
              )}
              <ArrowUpRight size={11} className="shrink-0 text-[var(--text-faint)]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Editing a question and asking again (§13).
 *
 * The warning is not decoration. Editing rewinds the conversation: this turn
 * and everything after it is replaced, because an answer that no longer follows
 * from the question above it is a transcript that lies about what was asked.
 */
function EditQuestion({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 320)}px`;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  return (
    <div>
      <textarea
        ref={field}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          event.target.style.height = 'auto';
          event.target.style.height = `${Math.min(event.target.scrollHeight, 320)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (text.trim()) onSave(text.trim());
          }
        }}
        className="mono w-full resize-none rounded border border-[var(--accent-line)] bg-[var(--surface-base)] p-[9px] text-[12.5px] leading-relaxed outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!text.trim() || text.trim() === initial}
          onClick={() => onSave(text.trim())}
        >
          Ask again
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <span className="text-[11px] leading-tight text-[var(--text-faint)]">
          This turn and everything after it is replaced.
        </span>
      </div>
    </div>
  );
}

/** §13 and §30: the actions, and the numbers, kept quiet until wanted. */
function Footer({
  message,
  onRegenerate,
  onAsk,
  projectId,
}: {
  message: AiMessage;
  onRegenerate: () => void;
  onAsk: (question: string) => void;
  projectId: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const speed =
    message.completionTokens && message.durationMs
      ? ((message.completionTokens / message.durationMs) * 1000).toFixed(0)
      : null;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-[6px]">
        <CopyButton value={message.content} label="Copy" />
        <Action icon={RefreshCw} label="Regenerate" onClick={onRegenerate} />
        <Action icon={Terminal} label="Continue" onClick={() => onAsk('Continue.')} />
        <Action icon={BookmarkPlus} label="Save" onClick={() => setSaving(true)} />

        <span className="mono ml-auto text-[10.5px] text-[var(--text-faint)]">
          {[
            formatDuration(message.durationMs),
            message.completionTokens ? `${message.completionTokens} tok` : null,
            speed ? `${speed} tok/s` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      {saving && (
        <SaveDialog message={message} projectId={projectId} onClose={() => setSaving(false)} />
      )}
    </>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof RefreshCw;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[24px] items-center gap-[5px] rounded border border-line bg-[var(--surface-raised)] px-[7px] text-[11.5px] transition-colors duration-[var(--fast)] hover:border-[var(--line-strong)]"
    >
      <Icon size={11} /> {label}
    </button>
  );
}

const TARGETS = [
  { value: 'note', label: 'Note', hint: 'A note in your workspace.' },
  { value: 'solution', label: 'Solution', hint: 'Findable next time it breaks.' },
  { value: 'adr', label: 'ADR', hint: 'Numbered, as a proposed decision.' },
  { value: 'task', label: 'Task', hint: 'Something to do.' },
  { value: 'document', label: 'Documentation', hint: 'A note typed as documentation.' },
];

/**
 * Saving an answer as a record (§14).
 *
 * Inline under the message rather than a modal: it is a continuation of reading
 * the answer, and a dialog that covers the text you are deciding about is a
 * dialog that makes you decide blind.
 */
function SaveDialog({
  message,
  projectId,
  onClose,
}: {
  message: AiMessage;
  projectId: string | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('note');
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<{ href: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (saved) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] px-3 py-2 text-[12px]">
        <span>Saved.</span>
        <Link href={saved.href} className="text-[var(--accent)] hover:underline">
          {saved.title}
        </Link>
        <button onClick={onClose} className="mono ml-auto text-[11px] text-[var(--text-faint)]">
          dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-line bg-[var(--surface-sunken)] p-3">
      <div className="label mb-2">Save this answer as</div>
      <div className="mb-2 flex flex-wrap gap-[5px]">
        {TARGETS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            onClick={() => setTarget(option.value)}
            className={cx(
              'rounded-sm border px-[9px] py-[4px] text-[11.5px] transition-colors',
              target === option.value
                ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'border-line bg-[var(--surface-raised)] hover:border-[var(--line-strong)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title — left blank, the question is used"
        className="mb-2 h-[30px] w-full rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] outline-none focus:border-[var(--accent-line)]"
      />

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await api<{ href: string; title: string }>(
              `/ai/messages/${message.id}/save`,
              { method: 'POST', body: { target, title: title.trim() || undefined, projectId } },
            ).catch(() => null);
            setBusy(false);
            if (result) setSaved(result);
          }}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        <p className="ml-auto max-w-[280px] text-[11px] leading-tight text-[var(--text-faint)]">
          The model, the question and the sources are recorded with it.
        </p>
      </div>
    </div>
  );
}

/** §45: a failure says what to check, and offers the way back. */
function Failure({ error, onRetry }: { error: ConsoleError; onRetry: () => void }) {
  const advice: Record<string, string[]> = {
    UNREACHABLE: [
      'Is Ollama running? `ollama serve`',
      'Is the URL in AI settings right?',
      'From a container, localhost is the container — use host.docker.internal.',
    ],
    MODEL_MISSING: ['Pull it, or pick another model from the switcher (⌘⇧M).'],
    OUT_OF_MEMORY: ['Try a smaller model, or a lower quantisation of the same one.'],
    TIMEOUT: ['A cold model is read off disk first. Raise OLLAMA_TIMEOUT_MS if this repeats.'],
  };

  return (
    <div className="rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-4">
      <div className="label mb-1 text-[var(--danger)]">
        {error.reason.replace(/_/g, ' ').toLowerCase()}
      </div>
      <p className="mb-2 text-[12.5px]">{error.message}</p>
      {(advice[error.reason] ?? []).map((line) => (
        <p key={line} className="mono text-[11px] leading-relaxed text-[var(--text-faint)]">
          — {line}
        </p>
      ))}
      <div className="mt-3 flex gap-2">
        <Button onClick={onRetry}>
          <RefreshCw size={12} /> Retry
        </Button>
        <Link href="/settings/intelligence">
          <Button>AI settings</Button>
        </Link>
      </div>
    </div>
  );
}
