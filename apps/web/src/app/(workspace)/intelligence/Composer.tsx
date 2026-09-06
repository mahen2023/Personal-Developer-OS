'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, CornerDownLeft, Cpu, Paperclip, Square, X } from 'lucide-react';
import { cx } from '@/lib/format';
import type { AiMode, Conversation, ModeDefinition, OllamaModel } from '@/lib/intelligence';
import { KeyHint } from '@/components/primitives';

/**
 * The command line (§7, §28).
 *
 * A prompt, not a message box: monospace caret, a `>` gutter, and slash
 * commands with completion. The console is a developer tool, so the input
 * behaves like the input developers already know — Enter sends, Shift+Enter
 * breaks the line, and a leading `/` is a command rather than text.
 */

export interface Command {
  name: string;
  argument?: string;
  hint: string;
}

const COMMANDS: Command[] = [
  { name: '/new', hint: 'Start a new conversation' },
  { name: '/model', argument: 'name', hint: 'Switch the model for this conversation' },
  { name: '/mode', argument: 'name', hint: 'Change how the assistant is asked' },
  { name: '/project', argument: 'name', hint: 'Attach a project as context' },
  { name: '/context', hint: 'Show what the assistant can currently see' },
  { name: '/clear', hint: 'Delete this conversation' },
  { name: '/save', hint: 'Save the last answer as a note' },
  { name: '/search', argument: 'terms', hint: 'Search your knowledge without asking a model' },
];

export function Composer({
  conversation,
  models,
  modes,
  streaming,
  attachments,
  onSend,
  onStop,
  onCommand,
  onDetach,
  onAttach,
}: {
  conversation: Conversation | null;
  models: OllamaModel[];
  modes: ModeDefinition[];
  streaming: boolean;
  attachments: { ref: string; label: string }[];
  /** Resolves false when nothing was generated, so the text can come back. */
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  onCommand: (command: string, argument: string) => void;
  onDetach: (ref: string) => void;
  onAttach: () => void;
}) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const completions = useMemo(() => {
    if (!value.startsWith('/') || value.includes(' ')) return [];
    return COMMANDS.filter((command) => command.name.startsWith(value.toLowerCase()));
  }, [value]);

  // Grows with the question, up to a point. A ten-line paste should be visible;
  // a hundred-line one should not swallow the transcript.
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value]);

  async function submit(): Promise<void> {
    const text = value.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      const [name, ...rest] = text.split(' ');
      onCommand(name.toLowerCase(), rest.join(' ').trim());
      setValue('');
      return;
    }
    if (streaming) return;

    // Cleared optimistically, because a box that stays full while the answer
    // streams invites sending it twice — and restored if the send came to
    // nothing, because retyping a paragraph is not the developer's job.
    setValue('');
    const ok = await onSend(text);
    if (!ok) {
      setValue((current) => (current.trim() ? current : text));
      input.current?.focus();
    }
  }

  return (
    <div className="border-t border-line bg-[var(--surface-sunken)]">
      <div className="flex flex-wrap items-center gap-[5px] border-b border-line px-4 py-[7px]">
        <span className="label mr-1">Context</span>
        <button
          onClick={onAttach}
          className="inline-flex items-center gap-[5px] rounded-sm border border-line bg-[var(--surface-raised)] px-[7px] py-[3px] text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)]"
        >
          <Paperclip size={10} /> Add
        </button>
        {attachments.length === 0 && (
          <span className="text-[11px] text-[var(--text-faint)]">
            Retrieval picks what is relevant. Attach a record to send it every turn.
          </span>
        )}
        {attachments.map((item) => (
          <span
            key={item.ref}
            className="inline-flex items-center gap-[5px] rounded-sm border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[7px] py-[3px] text-[11.5px] text-[var(--accent)]"
          >
            {item.label}
            <button
              onClick={() => onDetach(item.ref)}
              aria-label={`Remove ${item.label} from context`}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      {completions.length > 0 && (
        <ul className="border-b border-line px-4 py-[6px]">
          {completions.map((command) => (
            <li key={command.name} className="flex items-baseline gap-2 py-[2px]">
              <button
                onClick={() => setValue(`${command.name} `)}
                className="mono text-[11.5px] text-[var(--accent)]"
              >
                {command.name}
                {command.argument ? ` <${command.argument}>` : ''}
              </button>
              <span className="text-[11.5px] text-[var(--text-faint)]">{command.hint}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 px-4 py-3">
        <span
          aria-hidden
          className="mono select-none pt-[6px] text-[13px] leading-none text-[var(--accent)]"
        >
          &gt;
        </span>

        <textarea
          ref={input}
          value={value}
          rows={1}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter and Ctrl/Cmd+Enter both make a newline
            // safe to reach, because a pasted stack trace needs one (§52).
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              void submit();
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            conversation
              ? 'Ask about your projects, infrastructure, code or knowledge…'
              : 'Start a conversation…'
          }
          className="mono max-h-[220px] min-h-[22px] flex-1 resize-none border-none bg-transparent text-[12.5px] leading-relaxed outline-none placeholder:text-[var(--text-faint)]"
        />

        {streaming ? (
          <button
            onClick={onStop}
            className="inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] px-[9px] text-[11.5px] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
          >
            <Square size={9} fill="currentColor" /> Stop
            <KeyHint keys={['Esc']} />
          </button>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={!value.trim()}
            className="inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded border border-line bg-[var(--surface-raised)] px-[9px] text-[11.5px] transition-colors hover:border-[var(--line-strong)] disabled:opacity-40"
          >
            Send <CornerDownLeft size={11} />
          </button>
        )}
      </div>

      <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-[6px] text-[10.5px] text-[var(--text-faint)]">
        <span className="flex items-center gap-[5px]">
          <Cpu size={10} />
          {conversation?.model || 'no model'}
          {models.length > 0 &&
            conversation?.model &&
            !models.some((m) => m.name === conversation.model) && (
              <span className="text-[var(--warning)]">not installed</span>
            )}
        </span>
        <span>{modes.find((mode) => mode.mode === conversation?.mode)?.label ?? 'General'}</span>
        {conversation?.project && (
          <span className="flex items-center gap-[5px]">
            <Boxes size={10} /> {conversation.project.name}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <KeyHint keys={['/']} /> commands
          <KeyHint keys={['⌘', '⇧', 'M']} /> model
        </span>
      </div>
    </div>
  );
}

/**
 * The model switcher (§29).
 *
 * A palette rather than a dropdown, on the same chord as everything else in
 * this application. Switching is instant and never touches the transcript —
 * §54 is explicit that this must not interrupt with a confirmation.
 */
export function ModelSwitcher({
  models,
  current,
  onPick,
  onClose,
}: {
  models: OllamaModel[];
  current: string | null;
  onPick: (model: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = models.filter((model) =>
    model.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Switch model"
      className="anim-overlay fixed inset-0 z-50 flex items-start justify-center bg-[rgb(0_0_0/0.55)] pt-[14vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="anim-palette w-full max-w-[440px] overflow-hidden rounded-lg bg-[var(--surface-overlay)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="label border-b border-line px-4 py-[9px]">Switch model</div>

        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter…"
          className="mono h-[36px] w-full border-b border-line bg-transparent px-4 text-[12.5px] outline-none placeholder:text-[var(--text-faint)]"
        />

        {filtered.length === 0 ? (
          <p className="px-4 py-5 text-center text-[12px] text-[var(--text-faint)]">
            {models.length === 0
              ? 'No models are installed on this Ollama server.'
              : 'Nothing matches.'}
          </p>
        ) : (
          <ul className="max-h-[46vh] overflow-y-auto">
            {filtered.map((model) => (
              <li key={model.name}>
                <button
                  onClick={() => {
                    onPick(model.name);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 border-b border-line px-4 py-[8px] text-left transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                >
                  <span
                    aria-hidden
                    className={cx(
                      'h-[6px] w-[6px] shrink-0 rounded-full',
                      model.name === current
                        ? 'bg-[var(--accent)]'
                        : model.loaded
                          ? 'bg-[var(--success)]'
                          : 'bg-[var(--line-strong)]',
                    )}
                  />
                  <span className="mono min-w-0 flex-1 truncate text-[12.5px]">{model.name}</span>
                  <span className="mono shrink-0 text-[10.5px] text-[var(--text-faint)]">
                    {[model.parameterSize, model.loaded ? 'loaded' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export { COMMANDS };
export type { AiMode };
