'use client';

import { usePathname } from 'next/navigation';
import { findNavItem } from '@/lib/navigation';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { KeyHint } from '@/components/primitives';

/**
 * Every module in the navigation exists as a route from day one so the
 * information architecture is real and walkable, and so shortcuts and the
 * palette never dead-end. Each unbuilt module states what it will hold and
 * which phase brings it, rather than pretending to be broken.
 */
const HOLDS: Record<string, string[]> = {
  '/projects': [
    'status, priority, client, dates',
    'technology stack and progress',
    'every connected repository, server, database, domain and secret',
  ],
  '/notes': [
    'markdown with code blocks, tables and checklists',
    'note type and tags',
    'references to any project, server or deployment',
  ],
  '/tasks': [
    'list, kanban and timeline views',
    'status, priority, due date, assignee',
    'action items promoted from meetings',
  ],
  '/issues': [
    'the error message and the environment it appeared in',
    'root cause once found',
    'a link to the solution that closed it',
  ],
  '/ideas': [
    'category, priority and status from idea to shipped',
    'the project an idea belongs to',
  ],
  '/meetings': [
    'participants, discussion and decisions',
    'action items convertible straight into tasks',
  ],
  '/repositories': [
    'provider, URL, local path, default branch',
    'language and description',
    'deployments made from it',
  ],
  '/snippets': ['syntax-highlighted code by language', 'the project it came from'],
  '/commands': [
    'the command, its platform and its danger level',
    'a confirmation step before copying anything destructive',
  ],
  '/solutions': [
    'problem, error message, environment, root cause',
    'the fix and the commands that applied it',
    'answers to "have I solved this before?"',
  ],
  '/adrs': [
    'numbered decisions with context and alternatives',
    'consequences and supersession chain',
  ],
  '/servers': [
    'provider, IP, hostname, OS and specs',
    'the services running on it',
    'SSH credentials, stored as a vault reference',
  ],
  '/databases': [
    'type, host, port and database name',
    'credentials referenced from the vault, never in the clear',
  ],
  '/environments': [
    'development through production per project',
    'environment variables as literals or vault pointers',
  ],
  '/domains': ['registrar, DNS provider and expiry', 'auto-renewal state and reminders'],
  '/certificates': [
    'issuer, issue and expiry dates',
    'a valid / warning / critical read-out per certificate',
  ],
  '/deployments': [
    'version, commit, environment and server',
    'a timeline of every release and rollback',
  ],
  '/documents': [
    'PDF, DOCX, XLSX, markdown and images',
    'attached to a project, meeting, issue or note',
    'text extraction for search',
  ],
  '/bookmarks': ['categorised developer links', 'tags and project association'],
  '/learning': ['courses, books, articles and videos', 'progress and status'],
  '/vault': [
    'passwords, API keys, SSH keys, TOTP and tokens',
    'encrypted at rest, unlocked with a master password',
    'auto-lock, clipboard timeout and an audit trail',
  ],
  '/vault/passwords': ['passwords with a generator and strength meter'],
  '/vault/api-keys': ['API keys with rotation reminders'],
  '/vault/ssh-keys': ['SSH keys linked to the servers that use them'],
  '/vault/totp': ['TOTP codes with a live countdown'],
  '/search': [
    'one search across every module',
    'exact, fuzzy and tag search with type and date filters',
  ],
};

export function ModulePlaceholder() {
  const pathname = usePathname();
  const location = findNavItem(pathname);
  const item = location?.item;
  const holds = HOLDS[item?.href ?? ''] ?? [];

  useContextPanel(
    'Module',
    <div className="flex flex-col gap-3 p-4 text-[12px]">
      <div>
        <div className="label mb-[6px]">Status</div>
        <p className="text-[var(--text-muted)]">
          Route and navigation are live. The module lands in phase {item?.phase ?? '—'}.
        </p>
      </div>
      <div className="h-px bg-[var(--line)]" />
      <div>
        <div className="label mb-[6px]">Shortcut</div>
        {item?.chord ? (
          <KeyHint keys={['g', item.chord]} />
        ) : (
          <span className="text-[var(--text-faint)]">None assigned</span>
        )}
      </div>
    </div>,
    [pathname],
  );

  if (!item) return null;
  const Icon = item.icon;

  return (
    <div className="anim-enter mx-auto max-w-[720px] px-6 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded border border-line bg-[var(--surface-raised)]">
          <Icon size={15} strokeWidth={1.7} className="text-[var(--text-muted)]" />
        </span>
        <div>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">{item.label}</h1>
          <p className="mono text-[11px] text-[var(--text-faint)]">
            {location.section.label.toLowerCase()} · phase {item.phase ?? '—'}
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
        <div className="label border-b border-line px-4 py-[9px]">What this will hold</div>
        <ul className="flex flex-col gap-[6px] p-4">
          {holds.map((entry) => (
            <li
              key={entry}
              className="flex items-start gap-[10px] text-[12.5px] text-[var(--text-muted)]"
            >
              <span className="mt-[9px] h-px w-3 shrink-0 bg-[var(--line-strong)]" />
              {entry}
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-[9px] text-[11.5px] text-[var(--text-faint)]">
          The database tables behind this module already exist — see{' '}
          <span className="mono">apps/api/prisma/schema.prisma</span>.
        </div>
      </section>
    </div>
  );
}
