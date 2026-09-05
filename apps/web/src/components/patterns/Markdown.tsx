'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, Eye, PenLine } from 'lucide-react';
import { cx } from '@/lib/format';
import { TextArea } from './Form';

/**
 * Markdown rendering (§12).
 *
 * react-markdown builds React elements rather than injecting HTML, so there is
 * no `dangerouslySetInnerHTML` anywhere and no sanitiser to keep current — raw
 * HTML in a note is simply never executed.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children.trim()) {
    return <p className="text-[12.5px] italic text-[var(--text-faint)]">Nothing written yet.</p>;
  }
  return (
    <div className={cx('md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Write and preview, not a WYSIWYG. Markdown is the storage format, so showing
 * it plainly is honest — and it keeps code blocks, tables and checklists
 * editable by hand, which is the point for a developer's notes.
 */
export function MarkdownEditor({
  value,
  onChange,
  rows = 18,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <div className="overflow-hidden rounded border border-line bg-[var(--surface-base)]">
      <div className="flex items-center gap-1 border-b border-line bg-[var(--surface-sunken)] px-[6px] py-[4px]">
        <Tab
          active={mode === 'write'}
          onClick={() => setMode('write')}
          icon={PenLine}
          label="Write"
        />
        <Tab
          active={mode === 'preview'}
          onClick={() => setMode('preview')}
          icon={Eye}
          label="Preview"
        />
        <span className="mono ml-auto pr-1 text-[10.5px] text-[var(--text-faint)]">
          markdown · {value.length.toLocaleString()} chars
        </span>
      </div>

      {mode === 'write' ? (
        <TextArea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          mono
          placeholder={placeholder ?? '# Title\n\nSupports tables, task lists and fenced code.'}
          className="rounded-none border-0 focus:border-0"
        />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto px-3 py-2">
          <Markdown>{value}</Markdown>
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex h-[22px] items-center gap-[5px] rounded-sm px-[7px] text-[11.5px] transition-colors duration-[var(--fast)]',
        active
          ? 'bg-[var(--surface-active)] text-[var(--text)]'
          : 'text-[var(--text-faint)] hover:text-[var(--text)]',
      )}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

/**
 * Copy-to-clipboard with the confirmation inline on the button (§70) rather
 * than as a toast — the feedback belongs where the action happened.
 */
export function CopyButton({
  value,
  label = 'Copy',
  className,
  onCopied,
}: {
  value: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). Saying
      // nothing would look like the copy worked.
      window.prompt('Copy this manually:', value);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cx(
        'inline-flex h-[24px] items-center gap-[5px] rounded border border-line bg-[var(--surface-raised)] px-[7px] text-[11.5px] transition-colors duration-[var(--fast)] hover:border-[var(--line-strong)]',
        copied &&
          'border-[color-mix(in_srgb,var(--success)_45%,transparent)] text-[var(--success)]',
        className,
      )}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Read-only code with a copy affordance — used by snippets and commands. */
export function CodeViewer({
  code,
  language,
  maxHeight = '420px',
}: {
  code: string;
  language?: string;
  maxHeight?: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-line bg-[var(--surface-base)]">
      <div className="flex items-center gap-2 border-b border-line bg-[var(--surface-sunken)] px-[8px] py-[4px]">
        <span className="label">{language ?? 'text'}</span>
        <CopyButton value={code} className="ml-auto" />
      </div>
      <div className="md overflow-auto" style={{ maxHeight }}>
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
          {`\`\`\`${language ?? ''}\n${code}\n\`\`\``}
        </ReactMarkdown>
      </div>
    </div>
  );
}
