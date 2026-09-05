'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Cloud,
  Database,
  FileText,
  FolderGit2,
  Globe,
  Notebook,
  Pencil,
  Rocket,
  Server,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clockTime, cx, dayLabel, timeAgo } from '@/lib/format';
import {
  DEPLOYMENT_STATUS,
  HEALTH_SIGNAL,
  PRIORITY,
  PROJECT_STATUS,
  SERVER_STATUS,
  TASK_STATUS,
  humanise,
} from '@/lib/domain';
import type { ProjectGraph as GraphData, ProjectWorkspace } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine, ProgressBar, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { ProjectGraph } from '@/components/patterns/ProjectGraph';

type Tab = 'overview' | 'work' | 'code' | 'infrastructure' | 'knowledge';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work' },
  { id: 'code', label: 'Code' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'knowledge', label: 'Knowledge' },
];

export default function ProjectWorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const { data, loading, reload } = useRecord<ProjectWorkspace>(`/projects/${slug}/workspace`);
  const graph = useRecord<GraphData>(`/projects/${slug}/graph`);

  const favourite = useAction((isFavorite: boolean) =>
    api(`/projects/${data?.project.id}`, { method: 'PATCH', body: { isFavorite } }),
  );
  const remove = useAction(() => api(`/projects/${data?.project.id}`, { method: 'DELETE' }));

  useContextPanel('Project', data ? <ProjectContext workspace={data} /> : null, [
    data?.project.id,
    data?.project.updatedAt,
  ]);

  if (loading && !data) return <LoadingLine message="Loading project workspace…" />;
  if (!data) return null;

  const { project, health, infrastructure, work, deployments, activities } = data;

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      {/* ── header ─────────────────────────────────────────────────────────── */}
      <header className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="mt-[3px] h-[34px] w-[3px] shrink-0 rounded-sm"
              style={{ background: project.color ?? 'var(--accent)' }}
            />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.015em]">
                {project.name}
                <StatusIndicator
                  signal={PROJECT_STATUS[project.status]}
                  label={humanise(project.status)}
                />
              </h1>
              {project.description && (
                <p className="mt-[2px] max-w-[70ch] text-[12.5px] text-[var(--text-muted)]">
                  {project.description}
                </p>
              )}
              <div className="mono mt-[6px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
                {project.client && <span>{project.client}</span>}
                <Badge signal={PRIORITY[project.priority]}>{project.priority}</Badge>
                {project.techStack.map((tech) => (
                  <span key={tech}>{tech}</span>
                ))}
                {project.targetDate && <span>target {timeAgo(project.targetDate)}</span>}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => void favourite.run(!project.isFavorite).then(reload)}
              variant={project.isFavorite ? 'primary' : 'default'}
            >
              <Star size={13} />
              {project.isFavorite ? 'Favourite' : 'Favourite'}
            </Button>
            <Link href={`/projects/${project.slug}/edit`}>
              <Button>
                <Pencil size={13} /> Edit
              </Button>
            </Link>
            <Button
              variant="danger"
              // Icon-only, so it needs a name of its own: without one the
              // control is unreachable by screen reader and unnameable by
              // anything else.
              aria-label="Delete"
              disabled={remove.busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete "${project.name}"?\n\nIts ${connected(project.counts)} connected records are kept — they simply become unfiled.`,
                  )
                ) {
                  return;
                }
                await remove.run();
                router.push('/projects');
              }}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        <div className="mt-3 max-w-[320px]">
          <ProgressBar value={project.progress} />
        </div>
      </header>

      {/* ── tabs ───────────────────────────────────────────────────────────── */}
      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Project sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? 'page' : undefined}
            className={cx(
              'relative -mb-px border-b-2 px-3 py-[7px] text-[12.5px] transition-colors duration-[var(--fast)]',
              tab === entry.id
                ? 'border-[var(--accent)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div key={tab} className="anim-enter">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4">
              <Panel title="Project health">
                <div className="grid grid-cols-2 sm:grid-cols-4">
                  {Object.entries(health).map(([key, state], index) => (
                    <div
                      key={key}
                      className={cx(
                        'flex flex-col gap-[6px] border-line px-4 py-3',
                        index % 2 === 0 && 'border-r sm:border-r',
                        index < 2 && 'border-b sm:border-b-0',
                        index !== 3 && 'sm:border-r',
                      )}
                    >
                      <span className="label">{humanise(key)}</span>
                      <StatusIndicator
                        signal={HEALTH_SIGNAL[state] ?? 'neutral'}
                        label={state === 'none' ? 'None recorded' : humanise(state)}
                        pulse={state === 'ok'}
                      />
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Relationships"
                action={
                  <span className="mono flex items-center gap-1 text-[10.5px] text-[var(--text-faint)]">
                    <Share2 size={10} /> hover to trace
                  </span>
                }
              >
                {graph.data ? (
                  <ProjectGraph data={graph.data} />
                ) : (
                  <LoadingLine message="Building project graph…" />
                )}
              </Panel>
            </div>

            <Panel title="Activity">
              <Timeline activities={activities} />
            </Panel>
          </div>
        )}

        {tab === 'work' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={`Open tasks · ${work.tasks.length}`}
              href={`/tasks?projectId=${project.id}`}
            >
              <RowList
                rows={work.tasks}
                empty="No open tasks."
                href={(task) => `/tasks/${task.id}`}
                primary={(task) => task.title}
                secondary={(task) => (
                  <StatusIndicator
                    signal={TASK_STATUS[task.status]}
                    label={humanise(task.status)}
                  />
                )}
                trailing={(task) => (task.dueDate ? timeAgo(task.dueDate) : '')}
              />
            </Panel>
            <Panel title={`Notes · ${work.notes.length}`} href={`/notes?projectId=${project.id}`}>
              <RowList
                rows={work.notes}
                empty="No notes yet."
                href={(note) => `/notes/${note.id}`}
                primary={(note) => note.title}
                secondary={(note) => (
                  <span className="mono text-[11px] text-[var(--text-faint)]">
                    {humanise(note.type)}
                  </span>
                )}
                trailing={(note) => timeAgo(note.updatedAt)}
              />
            </Panel>
            <Panel
              title={`Solutions · ${work.solutions.length}`}
              href={`/solutions?projectId=${project.id}`}
            >
              <RowList
                rows={work.solutions}
                empty="Nothing solved here yet."
                href={(solution) => `/solutions/${solution.id}`}
                primary={(solution) => solution.title}
                secondary={(solution) => (
                  <span className="mono truncate text-[11px] text-[var(--text-faint)]">
                    {solution.environment ?? ''}
                  </span>
                )}
                trailing={(solution) => `${solution.useCount}×`}
              />
            </Panel>
            <Panel title={`Decisions · ${work.adrs.length}`} href={`/adrs?projectId=${project.id}`}>
              <RowList
                rows={work.adrs}
                empty="No architecture decisions recorded."
                href={(adr) => `/adrs/${adr.id}`}
                primary={(adr) => `ADR-${String(adr.number).padStart(3, '0')} ${adr.title}`}
                secondary={(adr) => <Badge>{adr.status}</Badge>}
                trailing={(adr) => timeAgo(adr.updatedAt)}
              />
            </Panel>
          </div>
        )}

        {tab === 'code' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={`Repositories · ${infrastructure.repositories.length}`}
              href={`/repositories?projectId=${project.id}`}
            >
              <RowList
                rows={infrastructure.repositories}
                empty="No repository connected."
                href={(repo) => `/repositories/${repo.id}`}
                icon={<FolderGit2 size={12} />}
                primary={(repo) => repo.name}
                secondary={(repo) => (
                  <span className="mono truncate text-[11px] text-[var(--text-faint)]">
                    {repo.language ?? humanise(repo.provider)}
                  </span>
                )}
                trailing={(repo) => repo.defaultBranch}
              />
            </Panel>
            <Panel
              title={`Deployments · ${deployments.length}`}
              href={`/deployments?projectId=${project.id}`}
            >
              <RowList
                rows={deployments}
                empty="Nothing deployed yet."
                href={(deployment) => `/deployments/${deployment.id}`}
                icon={<Rocket size={12} />}
                primary={(deployment) => deployment.version ?? 'Deployment'}
                secondary={(deployment) => (
                  <StatusIndicator
                    signal={DEPLOYMENT_STATUS[deployment.status]}
                    label={humanise(deployment.status)}
                  />
                )}
                trailing={(deployment) => timeAgo(deployment.deployedAt)}
              />
            </Panel>
          </div>
        )}

        {tab === 'infrastructure' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={`Environments · ${infrastructure.environments.length}`}
              href={`/environments?projectId=${project.id}`}
            >
              <RowList
                rows={infrastructure.environments}
                empty="No environments defined."
                href={(environment) => `/environments/${environment.id}`}
                icon={<Cloud size={12} />}
                primary={(environment) => environment.name}
                secondary={(environment) => <Badge>{environment.type}</Badge>}
                trailing={(environment) => environment.baseUrl ?? ''}
              />
            </Panel>
            <Panel
              title={`Servers · ${infrastructure.servers.length}`}
              href={`/servers?projectId=${project.id}`}
            >
              <RowList
                rows={infrastructure.servers}
                empty="No servers recorded."
                href={(server) => `/servers/${server.id}`}
                icon={<Server size={12} />}
                primary={(server) => server.name}
                secondary={(server) => (
                  <StatusIndicator
                    signal={SERVER_STATUS[server.status]}
                    label={server.ipAddress ?? humanise(server.status)}
                  />
                )}
                trailing={(server) =>
                  server.ramGb ? `${server.cpuCores ?? '?'}c / ${server.ramGb}GB` : ''
                }
              />
            </Panel>
            <Panel
              title={`Databases · ${infrastructure.databases.length}`}
              href={`/databases?projectId=${project.id}`}
            >
              <RowList
                rows={infrastructure.databases}
                empty="No databases recorded."
                href={(database) => `/databases/${database.id}`}
                icon={<Database size={12} />}
                primary={(database) => database.name}
                secondary={(database) => <Badge>{database.type}</Badge>}
                trailing={(database) => database.host ?? ''}
              />
            </Panel>
            <Panel
              title={`Domains and certificates · ${infrastructure.domains.length + infrastructure.certificates.length}`}
              href={`/domains?projectId=${project.id}`}
            >
              <RowList
                rows={infrastructure.domains}
                empty="No domains recorded."
                href={(domain) => `/domains/${domain.id}`}
                icon={<Globe size={12} />}
                primary={(domain) => domain.name}
                secondary={(domain) => (
                  <span className="mono text-[11px] text-[var(--text-faint)]">
                    {domain.registrar ?? ''}
                  </span>
                )}
                trailing={(domain) => (domain.expiresAt ? timeAgo(domain.expiresAt) : '')}
              />
              {infrastructure.certificates.length > 0 && (
                <div className="border-t border-line">
                  <RowList
                    rows={infrastructure.certificates}
                    empty=""
                    href={(certificate) => `/certificates/${certificate.id}`}
                    icon={<ShieldCheck size={12} />}
                    primary={(certificate) => certificate.commonName}
                    secondary={(certificate) => (
                      <span className="mono text-[11px] text-[var(--text-faint)]">
                        {certificate.issuer ?? ''}
                      </span>
                    )}
                    trailing={(certificate) => timeAgo(certificate.expiresAt)}
                  />
                </div>
              )}
            </Panel>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title={`Documents · ${work.documents.length}`}
              href={`/documents?projectId=${project.id}`}
            >
              <RowList
                rows={work.documents}
                empty="No documents attached."
                href={(document) => `/documents/${document.id}`}
                icon={<FileText size={12} />}
                primary={(document) => document.originalName}
                secondary={(document) => (
                  <span className="mono text-[11px] text-[var(--text-faint)]">{document.kind}</span>
                )}
                trailing={(document) => `${Math.max(1, Math.round(document.sizeBytes / 1024))} KB`}
              />
            </Panel>
            <Panel title="Notes" href={`/notes?projectId=${project.id}`}>
              <RowList
                rows={work.notes}
                empty="No notes yet."
                href={(note) => `/notes/${note.id}`}
                icon={<Notebook size={12} />}
                primary={(note) => note.title}
                secondary={(note) => (
                  <span className="truncate text-[11.5px] text-[var(--text-faint)]">
                    {note.preview}
                  </span>
                )}
                trailing={(note) => timeAgo(note.updatedAt)}
              />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Panel({
  title,
  href,
  action,
  children,
}: {
  title: string;
  href?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
      <div className="flex h-8 items-center gap-2 border-b border-line px-4">
        <span className="label">{title}</span>
        <span className="ml-auto">
          {action}
          {href && (
            <Link
              href={href}
              className="text-[11px] text-[var(--text-faint)] transition-colors hover:text-[var(--accent)]"
            >
              Open all →
            </Link>
          )}
        </span>
      </div>
      {children}
    </section>
  );
}

function RowList<T extends { id: string }>({
  rows,
  href,
  primary,
  secondary,
  trailing,
  icon,
  empty,
}: {
  rows: T[];
  href: (row: T) => string;
  primary: (row: T) => string;
  secondary?: (row: T) => React.ReactNode;
  trailing?: (row: T) => string;
  icon?: React.ReactNode;
  empty: string;
}) {
  if (rows.length === 0) {
    return empty ? <p className="px-4 py-4 text-[12px] text-[var(--text-faint)]">{empty}</p> : null;
  }
  return (
    <ul className="stagger">
      {rows.slice(0, 8).map((row) => (
        <li key={row.id}>
          <Link
            href={href(row)}
            className="flex items-center gap-3 border-b border-line px-4 py-[7px] transition-colors duration-[var(--fast)] last:border-b-0 hover:bg-[var(--surface-hover)]"
          >
            {icon && <span className="shrink-0 text-[var(--text-faint)]">{icon}</span>}
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{primary(row)}</span>
            {secondary && <span className="shrink-0">{secondary(row)}</span>}
            {trailing && (
              <span className="mono w-[76px] shrink-0 truncate text-right text-[11px] text-[var(--text-faint)]">
                {trailing(row)}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ activities }: { activities: ProjectWorkspace['activities'] }) {
  if (activities.length === 0) {
    return (
      <p className="px-4 py-4 text-[12px] text-[var(--text-faint)]">Nothing has happened yet.</p>
    );
  }
  let currentDay = '';
  return (
    <div className="stagger py-1">
      {activities.map((entry) => {
        const day = dayLabel(entry.createdAt);
        const showDay = day !== currentDay;
        currentDay = day;
        return (
          <div key={entry.id}>
            {showDay && <div className="label px-4 pb-1 pt-3">{day}</div>}
            <div className="flex gap-3 px-4 py-[4px]">
              <span className="mono w-[36px] shrink-0 text-[11px] text-[var(--text-faint)]">
                {clockTime(entry.createdAt)}
              </span>
              <span className="min-w-0 flex-1 text-[12px] text-[var(--text-muted)]">
                {entry.summary}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectContext({ workspace }: { workspace: ProjectWorkspace }) {
  const { project, infrastructure, work, deployments } = workspace;
  const entries: [string, number, string][] = [
    ['Repositories', infrastructure.repositories.length, `/repositories?projectId=${project.id}`],
    ['Environments', infrastructure.environments.length, `/environments?projectId=${project.id}`],
    ['Servers', infrastructure.servers.length, `/servers?projectId=${project.id}`],
    ['Databases', infrastructure.databases.length, `/databases?projectId=${project.id}`],
    ['Domains', infrastructure.domains.length, `/domains?projectId=${project.id}`],
    ['Certificates', infrastructure.certificates.length, `/certificates?projectId=${project.id}`],
    ['Deployments', deployments.length, `/deployments?projectId=${project.id}`],
    ['Tasks', work.tasks.length, `/tasks?projectId=${project.id}`],
    ['Notes', work.notes.length, `/notes?projectId=${project.id}`],
    ['Solutions', work.solutions.length, `/solutions?projectId=${project.id}`],
    ['Documents', work.documents.length, `/documents?projectId=${project.id}`],
    ['Secrets', project.counts.vaultItems, `/vault?projectId=${project.id}`],
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="label mb-[6px]">Connected</div>
        <ul className="flex flex-col">
          {entries.map(([label, count, href]) => (
            <li key={label}>
              <Link
                href={href}
                className={cx(
                  'flex items-center justify-between py-[3px] text-[12px] transition-colors',
                  count > 0
                    ? 'text-[var(--text-muted)] hover:text-[var(--accent)]'
                    : 'text-[var(--text-faint)]',
                )}
              >
                {label}
                <span className="num">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {project.tags.length > 0 && (
        <>
          <div className="h-px bg-[var(--line)]" />
          <div>
            <div className="label mb-[6px]">Tags</div>
            <div className="flex flex-wrap gap-[4px]">
              {project.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/search?tags=${tag.slug}`}
                  className="mono rounded-sm border border-line bg-[var(--surface-hover)] px-[5px] py-[1px] text-[11px] text-[var(--text-muted)] hover:border-[var(--accent-line)]"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="h-px bg-[var(--line)]" />
      <div className="mono flex flex-col gap-[3px] text-[11px] text-[var(--text-faint)]">
        <span>created {timeAgo(project.createdAt)}</span>
        <span>updated {timeAgo(project.updatedAt)}</span>
        {project.startDate && <span>started {timeAgo(project.startDate)}</span>}
        {project.targetDate && <span>target {timeAgo(project.targetDate)}</span>}
      </div>
    </div>
  );
}

function connected(counts: ProjectWorkspace['project']['counts']): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
