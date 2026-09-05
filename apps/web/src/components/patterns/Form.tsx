'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, TriangleAlert, X } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { cx } from '@/lib/format';
import type { Paged } from '@/lib/types';

/* ── layout ───────────────────────────────────────────────────────────────── */

export function FormPanel({
  title,
  description,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]"
    >
      <div className="border-b border-line px-4 py-[9px]">
        <div className="label">{title}</div>
        {description && (
          <p className="mt-[2px] text-[12px] text-[var(--text-faint)]">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-[14px] p-4">{children}</div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-[10px]">{footer}</div>
    </form>
  );
}

/**
 * Every control inside a Field is named by that Field's label.
 *
 * The id travels by context rather than by wrapping the control in a <label>:
 * a wrapping label would also claim the buttons inside a rich editor, and the
 * first one it found would win. Explicit htmlFor is unambiguous.
 */
const FieldContext = createContext<string | undefined>(undefined);

/** Controls call this to inherit their Field's id, unless given one. */
function useFieldId(explicit?: string): string | undefined {
  const inherited = useContext(FieldContext);
  return explicit ?? inherited;
}

/** Label on the left, control on the right — dense, and scannable in a column. */
export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={cx('flex gap-3', wide ? 'flex-col' : 'items-start')}>
      <div className={cx('shrink-0', wide ? 'pt-0' : 'w-[130px] pt-[6px]')}>
        <label htmlFor={id} className="label cursor-pointer">
          {label}
        </label>
        {hint && (
          <p className="mt-[2px] text-[11px] leading-snug text-[var(--text-faint)]">{hint}</p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <FieldContext.Provider value={id}>{children}</FieldContext.Provider>
      </div>
    </div>
  );
}

const CONTROL =
  'w-full rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] text-[var(--text)] outline-none transition-colors duration-[var(--fast)] focus:border-[var(--accent-line)] placeholder:text-[var(--text-faint)] disabled:opacity-50';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      id={useFieldId(props.id)}
      className={cx(CONTROL, 'h-[30px]', props.className)}
    />
  );
}

export function TextArea({
  rows = 6,
  mono,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      {...props}
      id={useFieldId(props.id)}
      rows={rows}
      className={cx(CONTROL, 'resize-y py-[7px] leading-relaxed', mono && 'mono', props.className)}
    />
  );
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        {...props}
        id={useFieldId(props.id)}
        className={cx(CONTROL, 'h-[30px] appearance-none pr-7', props.className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-raised)]">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
    </div>
  );
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  // A native date control beats any picker library: keyboard entry, locale
  // formatting and mobile pickers all come free.
  return (
    <input
      type="date"
      {...props}
      id={useFieldId(props.id)}
      className={cx(CONTROL, 'h-[30px] mono', props.className)}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]"
    >
      <span
        className={cx(
          'flex h-[16px] w-[16px] items-center justify-center rounded-sm border transition-colors duration-[var(--fast)]',
          checked
            ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
            : 'border-line bg-[var(--surface-base)]',
        )}
      >
        {checked && <Check size={11} />}
      </span>
      {label}
    </button>
  );
}

/* ── errors ───────────────────────────────────────────────────────────────── */

export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      // Named so it is distinguishable from Next's own role="alert" route
      // announcer, both for assistive tech and for tests.
      aria-label="Error"
      className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2"
    >
      <TriangleAlert size={13} className="mt-[2px] shrink-0 text-[var(--danger)]" />
      <div className="min-w-0">
        <p className="text-[12.5px]">{error.message}</p>
        {error.details?.map((detail) => (
          <p key={detail} className="text-[11.5px] text-[var(--text-muted)]">
            {detail}
          </p>
        ))}
        {error.errorId && (
          <p className="mono mt-[2px] text-[10.5px] text-[var(--text-faint)]">
            error {error.errorId}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── tags ─────────────────────────────────────────────────────────────────── */

interface TagOption {
  id: string;
  name: string;
  slug: string;
  count: number;
}

/**
 * Free-text tags with suggestions from what already exists. Suggesting beats
 * enforcing a fixed list: the point of tags is that you invent them as you go,
 * but "docker" and "Docker" should still land on the same one.
 */
export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [options, setOptions] = useState<TagOption[]>([]);
  const [open, setOpen] = useState(false);
  const id = useId();
  const fieldId = useFieldId();

  useEffect(() => {
    api<TagOption[]>('/tags')
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const lowered = value.map((tag) => tag.toLowerCase());
  const suggestions = options
    .filter(
      (option) =>
        !lowered.includes(option.name.toLowerCase()) &&
        (draft ? option.name.toLowerCase().includes(draft.toLowerCase()) : true),
    )
    .slice(0, 8);

  function add(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || lowered.includes(trimmed.toLowerCase())) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  return (
    <div className="relative">
      <div className="flex min-h-[30px] flex-wrap items-center gap-[5px] rounded border border-line bg-[var(--surface-base)] px-[6px] py-[4px] focus-within:border-[var(--accent-line)]">
        {value.map((tag) => (
          <span
            key={tag}
            className="mono flex items-center gap-[4px] rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[11px]"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((entry) => entry !== tag))}
              aria-label={`Remove ${tag}`}
              className="text-[var(--text-faint)] hover:text-[var(--danger)]"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          id={fieldId}
          placeholder={value.length === 0 ? 'Add a tag and press Enter' : ''}
          aria-label="Tags"
          aria-describedby={id}
          className="min-w-[140px] flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--text-faint)]"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={id}
          className="anim-enter absolute z-20 mt-1 w-full overflow-hidden rounded border border-line bg-[var(--surface-overlay)]"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          {suggestions.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(option.name)}
                className="flex w-full items-center gap-2 px-3 py-[5px] text-left text-[12.5px] hover:bg-[var(--surface-hover)]"
              >
                <span className="flex-1">{option.name}</span>
                <span className="num text-[11px] text-[var(--text-faint)]">{option.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── project picker ───────────────────────────────────────────────────────── */

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** Every entity can belong to a project, so this control appears on every form. */
export function ProjectSelect({
  value,
  onChange,
  allowNone = true,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  allowNone?: boolean;
}) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api<Paged<ProjectOption>>('/projects?limit=100&sort=name&order=asc')
      .then((result) => setProjects(result.items))
      .catch(() => setProjects([]));
  }, []);

  return (
    <Select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      options={[
        ...(allowNone ? [{ value: '', label: 'No project — keep it unfiled' }] : []),
        ...projects.map((project) => ({
          value: project.id,
          label:
            project.status === 'ACTIVE'
              ? project.name
              : `${project.name} · ${project.status.toLowerCase()}`,
        })),
      ]}
    />
  );
}

/* ── entity pickers ───────────────────────────────────────────────────────── */

/**
 * A select backed by any list endpoint.
 *
 * Tolerant of a missing endpoint on purpose: modules arrive in phases, and a
 * form that throws because the vault is not built yet would block the whole
 * screen. It degrades to a disabled control with an explanation instead.
 */
export function EntitySelect<T extends { id: string }>({
  path,
  value,
  onChange,
  label,
  render,
  noneLabel = 'None',
  unavailable,
}: {
  path: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  render: (row: T) => string;
  noneLabel?: string;
  unavailable?: string;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Paged<T>>(path)
      .then((result) => !cancelled && setRows(result.items))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <p className="flex h-[30px] items-center text-[12px] text-[var(--text-faint)]">
        {unavailable ?? 'Not available yet.'}
      </p>
    );
  }

  return (
    <Select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      options={[
        { value: '', label: noneLabel },
        ...rows.map((row) => ({ value: row.id, label: render(row) })),
      ]}
    />
  );
}

/** Environments, shown as "Production · Basuki" so the choice is unambiguous. */
export function EnvironmentSelect({
  value,
  onChange,
  projectId,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  projectId?: string | null;
}) {
  return (
    <EntitySelect<{ id: string; name: string; type: string; project?: { name: string } | null }>
      // Scoped to the project when there is one — picking "Production" out of
      // eleven identically-named environments is not a choice worth offering.
      path={`/environments?limit=100${projectId ? `&projectId=${projectId}` : ''}`}
      value={value}
      onChange={onChange}
      label="Environment"
      noneLabel="No environment"
      render={(row) => (row.project ? `${row.name} · ${row.project.name}` : row.name)}
    />
  );
}

/** Vault items, by name only. The secret never reaches this control. */
export function VaultItemSelect({
  value,
  onChange,
  type,
  noneLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  type?: string;
  noneLabel?: string;
}) {
  return (
    <EntitySelect<{ id: string; name: string; type: string }>
      path={`/vault/items?limit=100${type ? `&type=${type}` : ''}`}
      value={value}
      onChange={onChange}
      label="Vault item"
      noneLabel={noneLabel ?? 'No credential linked'}
      unavailable="The vault arrives in phase 5."
      render={(row) => row.name}
    />
  );
}
