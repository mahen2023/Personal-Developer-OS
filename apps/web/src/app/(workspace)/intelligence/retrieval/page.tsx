'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CornerDownLeft,
  Database,
  ListTree,
  RefreshCw,
  Telescope,
  TriangleAlert,
} from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { humanise } from '@/lib/domain';
import { useAction } from '@/hooks/useResource';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { PanelDivider, PanelSection } from '@/components/patterns/DetailShell';
import { Button, SIGNAL_COLOR, type Signal, StatusIndicator } from '@/components/primitives';
import { PageHeader } from '@/components/patterns/PageShell';

/* ── what the API says ────────────────────────────────────────────────────── */

interface Citation {
  index: number;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  excerpt: string;
  score: number;
}

interface Row {
  title: string;
  detail?: string;
  when?: string;
  href: string;
  signal?: Signal;
}

interface Answer {
  question: string;
  mode: 'records' | 'knowledge';
  headline: string;
  prose: string | null;
  generatedBy: string | null;
  citations: Citation[];
  rows: Row[];
  note: string | null;
}

interface Status {
  generation: boolean;
  generationModel: string | null;
  embeddingModel: string;
  matching: 'lexical' | 'semantic';
  sources: string[];
  index: {
    chunks: number;
    records: number;
    byType: { entityType: string; records: number; chunks: number }[];
    models: string[];
    lastIndexedAt: string | null;
  };
}

/**
 * The intelligence console (§75).
 *
 * Deliberately not a chat. There is no conversation, no assistant persona and
 * nothing pretending to think: you ask, and it either runs a query or returns
 * passages you wrote, with the record attached. An instrument reports its own
 * calibration, which is what the strip under the input is for — it says which
 * model is loaded and whether it matches words or meaning, so you can tell
 * before asking whether the answer is worth trusting.
 */
export default function IntelligencePage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);

  const refreshStatus = useCallback(async () => {
    setStatus(await api<Status>('/ai/status').catch(() => null));
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const ask = useAction((text: string) =>
    api<Answer>('/ai/ask', { method: 'POST', body: { question: text } }),
  );

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || ask.busy) return;
      setQuestion(trimmed);
      const result = await ask.run(trimmed);
      if (!result) return;
      setAnswer(result);
      // Most recent first, no repeats — this is a scratchpad, not a transcript,
      // and it is gone when the tab closes.
      setHistory((previous) =>
        [trimmed, ...previous.filter((item) => item !== trimmed)].slice(0, 12),
      );
    },
    [ask],
  );

  useContextPanel(
    'Index',
    <IndexPanel status={status} history={history} onRun={submit} onRebuilt={refreshStatus} />,
    [status, history.length, ask.busy],
  );

  return (
    <div className="mx-auto max-w-[880px] px-6 pb-16 pt-6">
      <PageHeader
        icon={Telescope}
        title="Intelligence"
        subtitle="Ask about your own records. Every answer names where it came from."
      />

      <QueryBar
        value={question}
        onChange={setQuestion}
        onSubmit={submit}
        busy={ask.busy}
        inputRef={input}
      />

      <Calibration status={status} />

      {ask.error && <ErrorNote error={ask.error} />}

      {answer ? (
        <AnswerView answer={answer} />
      ) : (
        <Suggestions
          matching={status?.matching}
          onPick={(text) => {
            setQuestion(text);
            void submit(text);
          }}
        />
      )}
    </div>
  );
}

/* ── the input ────────────────────────────────────────────────────────────── */

function QueryBar({
  value,
  onChange,
  onSubmit,
  busy,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="flex items-start gap-2 rounded border border-line bg-[var(--surface-raised)] p-2 focus-within:border-[var(--accent-line)]"
    >
      <textarea
        ref={inputRef}
        value={value}
        rows={2}
        autoFocus
        aria-label="Question"
        placeholder="Why did the staging deploy fail last month?"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter asks; shift-enter is a newline. A question is usually one
          // line, so the fast path should be the common one.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit(value);
          }
        }}
        className="min-h-[42px] flex-1 resize-none bg-transparent px-1 py-[3px] text-[13.5px] leading-relaxed outline-none placeholder:text-[var(--text-faint)]"
      />
      <Button type="submit" variant="primary" disabled={busy || !value.trim()} className="shrink-0">
        {busy ? 'Looking…' : 'Ask'}
        {!busy && <CornerDownLeft size={12} />}
      </Button>
    </form>
  );
}

/**
 * The instrument's own readings. Plain monospace facts, no reassurance: if
 * matching is lexical and generation is off, the strip says so, and the answer
 * below can be read in that light.
 */
function Calibration({ status }: { status: Status | null }) {
  if (!status) return <div className="h-[26px]" />;

  const lexical = status.matching === 'lexical';
  return (
    <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 px-1 py-[7px] text-[11px] text-[var(--text-faint)]">
      <span className="flex items-center gap-[6px]">
        <StatusIndicator
          signal={status.index.chunks > 0 ? 'success' : 'warning'}
          label={`${status.index.records} records indexed`}
        />
      </span>
      <span title={status.embeddingModel}>
        {lexical ? 'matching words' : 'matching meaning'} · {status.embeddingModel}
      </span>
      <span>
        {status.generation
          ? `written answers · ${status.generationModel}`
          : 'written answers off — passages only'}
      </span>
    </div>
  );
}

/* ── the answer ───────────────────────────────────────────────────────────── */

function AnswerView({ answer }: { answer: Answer }) {
  return (
    <section className="anim-enter mt-4" aria-label="Answer">
      <div className="mb-3 flex items-baseline gap-2 border-b border-line pb-2">
        <span
          className="label shrink-0"
          style={{ color: answer.mode === 'records' ? 'var(--info)' : 'var(--accent)' }}
        >
          {answer.mode === 'records' ? 'From your records' : 'From what you wrote'}
        </span>
        <h2 className="min-w-0 flex-1 text-[13.5px] font-medium">{answer.headline}</h2>
      </div>

      {answer.prose && (
        <div className="mb-4 border-l-2 border-[var(--accent-line)] pl-3 text-[13.5px] leading-[1.65]">
          <Prose text={answer.prose} citations={answer.citations} />
          <p className="mono mt-2 text-[10.5px] text-[var(--text-faint)]">
            written by {answer.generatedBy} from the sources below — check them
          </p>
        </div>
      )}

      {answer.note && !answer.prose && (
        <p className="mb-3 text-[12.5px] text-[var(--text-muted)]">{answer.note}</p>
      )}

      {answer.rows.length > 0 && <RecordTable rows={answer.rows} />}
      {answer.citations.length > 0 && <Sources citations={answer.citations} />}
    </section>
  );
}

/**
 * Renders the model's prose, turning each `[n]` marker into a link to the
 * source it points at. A claim you cannot click through to is a claim you
 * cannot check.
 */
function Prose({ text, citations }: { text: string; citations: Citation[] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) => {
        const marker = /^\[(\d+)\]$/.exec(part);
        const cited = marker && citations[Number(marker[1]) - 1];
        if (!cited) return <span key={index}>{part}</span>;
        return (
          <Link
            key={index}
            href={cited.href}
            title={cited.title}
            className="mono mx-[2px] rounded-sm border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[3px] text-[10px] align-super text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
          >
            {marker[1]}
          </Link>
        );
      })}
    </p>
  );
}

/** Structured answers are a table, because that is what they are. */
function RecordTable({ rows }: { rows: Row[] }) {
  return (
    <ul className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      {rows.map((row, index) => (
        <li key={`${row.href}-${index}`} className="border-b border-line last:border-b-0">
          <Link
            href={row.href}
            className="flex items-center gap-3 px-3 py-[7px] transition-colors duration-[var(--fast)] hover:bg-[var(--surface-hover)]"
          >
            <span
              aria-hidden
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: SIGNAL_COLOR[row.signal ?? 'neutral'] }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.title}</span>
            {row.detail && (
              <span className="hidden shrink-0 truncate text-[11.5px] text-[var(--text-muted)] sm:block">
                {row.detail}
              </span>
            )}
            {row.when && (
              <span className="mono w-[74px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                {timeAgo(row.when)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The passages themselves, numbered to match the citation markers. Shown in
 * full rather than summarised — your own words are the most trustworthy thing
 * on this page.
 */
function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-4">
      <div className="label mb-2 flex items-center gap-2">
        Sources
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <ol className="flex flex-col gap-2">
        {citations.map((citation) => (
          <li key={citation.entityId} className="flex gap-3">
            <span className="mono mt-[2px] h-[18px] w-[18px] shrink-0 rounded-sm border border-line bg-[var(--surface-raised)] text-center text-[10px] leading-[17px] text-[var(--text-faint)]">
              {citation.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <Link
                  href={citation.href}
                  className="truncate text-[12.5px] font-medium hover:text-[var(--accent)]"
                >
                  {citation.title}
                </Link>
                <span className="mono shrink-0 text-[10.5px] text-[var(--text-faint)]">
                  {humanise(citation.entityType)} · {citation.score.toFixed(2)}
                </span>
              </div>
              <p className="mt-[3px] whitespace-pre-wrap rounded border border-line bg-[var(--surface-sunken)] px-[9px] py-[6px] text-[12px] leading-relaxed text-[var(--text-muted)]">
                {citation.excerpt}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ErrorNote({ error }: { error: ApiError }) {
  return (
    <p
      role="alert"
      aria-label="Error"
      className="mt-3 flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-dim)] px-3 py-2 text-[12.5px] text-[var(--danger)]"
    >
      <TriangleAlert size={13} className="mt-[2px] shrink-0" />
      {error.message}
    </p>
  );
}

/* ── discoverability ──────────────────────────────────────────────────────── */

/** Questions the database answers exactly, and questions retrieval answers. */
const EXACT = [
  'What expires in the next 60 days?',
  'How many issues are still open?',
  'What is due this week?',
  'What did I deploy recently?',
  'Which projects are active?',
];

const WRITTEN = [
  'How did I fix the connection pool problem?',
  'Why did we choose this database?',
  'What did we decide in the last meeting?',
];

/**
 * A console that cannot say what it answers is a guessing game. These are the
 * real intents, listed literally — the left column runs a query, the right
 * searches what you have written.
 */
function Suggestions({
  matching,
  onPick,
}: {
  matching?: 'lexical' | 'semantic';
  onPick: (question: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2">
      <Column
        icon={Database}
        title="Answered by a query"
        hint="Exact, current, counted from your records."
        items={EXACT}
        onPick={onPick}
      />
      <Column
        icon={ListTree}
        title="Answered from your writing"
        hint={
          matching === 'lexical'
            ? 'Notes, solutions, decisions and meetings. Matched on words, so use the terms you would have written.'
            : 'Notes, solutions, decisions and meetings, matched on meaning.'
        }
        items={WRITTEN}
        onPick={onPick}
      />
    </div>
  );
}

function Column({
  icon: Icon,
  title,
  hint,
  items,
  onPick,
}: {
  icon: typeof Database;
  title: string;
  hint: string;
  items: string[];
  onPick: (question: string) => void;
}) {
  return (
    <section>
      <div className="label mb-1 flex items-center gap-[6px]">
        <Icon size={12} />
        {title}
      </div>
      <p className="mb-2 text-[12px] leading-relaxed text-[var(--text-faint)]">{hint}</p>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item}>
            <button
              onClick={() => onPick(item)}
              className="w-full border-b border-line py-[7px] text-left text-[12.5px] text-[var(--text-muted)] transition-colors duration-[var(--fast)] hover:text-[var(--accent)]"
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── the context panel ────────────────────────────────────────────────────── */

function IndexPanel({
  status,
  history,
  onRun,
  onRebuilt,
}: {
  status: Status | null;
  history: string[];
  onRun: (question: string) => void;
  onRebuilt: () => Promise<void>;
}) {
  const rebuild = useAction(() => api('/ai/reindex', { method: 'POST', body: {} }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Indexed">
        {/* Three states, not two: not knowing yet is different from knowing
            there is nothing, and saying the wrong one is a small lie. */}
        {!status ? (
          <p className="text-[12px] text-[var(--text-faint)]">Reading the index…</p>
        ) : status.index.byType.length > 0 ? (
          <ul className="flex flex-col gap-[3px]">
            {status.index.byType.map((row) => (
              <li key={row.entityType} className="flex items-baseline gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
                  {humanise(row.entityType)}
                </span>
                <span className="mono text-[11px] text-[var(--text-faint)]">{row.records}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-muted)]">
            Nothing indexed yet. Rebuild to read everything you have written so far.
          </p>
        )}
      </PanelSection>

      <PanelSection title="Rebuild">
        <p className="mb-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          Records are indexed as you save them. A rebuild is only needed after changing the
          embedding provider, or to pick up documents uploaded before this was switched on.
        </p>
        <Button
          onClick={async () => {
            await rebuild.run();
            await onRebuilt();
          }}
          disabled={rebuild.busy}
        >
          <RefreshCw size={12} className={cx(rebuild.busy && 'animate-spin')} />
          {rebuild.busy ? 'Reading…' : 'Rebuild index'}
        </Button>
        {status?.index.lastIndexedAt && (
          <p className="mono mt-2 text-[10.5px] text-[var(--text-faint)]">
            last written {timeAgo(status.index.lastIndexedAt)}
          </p>
        )}
      </PanelSection>

      {history.length > 0 && (
        <>
          <PanelDivider />
          <PanelSection title="This session">
            <ul className="flex flex-col gap-[2px]">
              {history.map((item) => (
                <li key={item}>
                  <button
                    onClick={() => onRun(item)}
                    className="w-full truncate text-left text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                    title={item}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </PanelSection>
        </>
      )}
    </div>
  );
}
