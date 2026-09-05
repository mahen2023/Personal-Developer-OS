'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, GitBranch, Rocket } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { DEPLOYMENT_STATUS, humanise } from '@/lib/domain';
import type { Repository } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CopyButton, Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  LinkedRecords,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { RepositoryEditor } from '../RepositoryEditor';

export default function RepositoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: repo, loading, set } = useRecord<Repository>(`/repositories/${id}`);

  useContextPanel('Repository', repo ? <RepositoryContext repo={repo} /> : null, [
    repo?.id,
    repo?.updatedAt,
  ]);

  if (loading && !repo) return <LoadingLine message="Loading repository…" />;
  if (!repo) return null;

  if (editing) {
    return (
      <RepositoryEditor
        repository={repo}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <DetailShell
      title={repo.name}
      eyebrow={`Repository · ${humanise(repo.provider)}`}
      onEdit={() => setEditing(true)}
      deletePath={`/repositories/${id}`}
      deleteBackTo="/repositories"
      deleteConfirm={`Remove "${repo.name}"? Only the record goes — your code is untouched.`}
      meta={
        <>
          <span className="flex items-center gap-[5px]">
            <GitBranch size={10} /> {repo.defaultBranch}
          </span>
          {repo.language && <span>{repo.language}</span>}
          <Badge>{repo.isPrivate ? 'PRIVATE' : 'PUBLIC'}</Badge>
          {repo.project && (
            <Link href={`/projects/${repo.project.slug}`} className="hover:text-[var(--accent)]">
              {repo.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          <Row label="Remote">
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mono flex min-w-0 items-center gap-[6px] text-[12px] text-[var(--info)] hover:underline"
            >
              <span className="truncate">{repo.url}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
            <CopyButton value={repo.url} label="" />
          </Row>

          {repo.localPath && (
            <Row label="Local path">
              <code className="mono min-w-0 flex-1 truncate text-[12px]">{repo.localPath}</code>
              <CopyButton value={repo.localPath} label="" />
            </Row>
          )}

          <Row label="Clone">
            <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
              git clone {repo.url}
            </code>
            <CopyButton value={`git clone ${repo.url}`} label="" />
          </Row>
        </section>

        {repo.description && <Markdown>{repo.description}</Markdown>}

        {repo.deployments && repo.deployments.length > 0 && (
          <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
            <div className="label flex h-8 items-center border-b border-line px-4">
              Recent deployments
            </div>
            <ul>
              {repo.deployments.map((deployment) => (
                <li key={deployment.id}>
                  <Link
                    href={`/deployments/${deployment.id}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-[7px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                  >
                    <Rocket size={12} className="shrink-0 text-[var(--text-faint)]" />
                    <span className="mono min-w-0 flex-1 truncate text-[12px]">
                      {deployment.version ?? 'Deployment'}
                    </span>
                    <StatusIndicator
                      signal={DEPLOYMENT_STATUS[deployment.status]}
                      label={humanise(deployment.status)}
                    />
                    <span className="mono w-[76px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                      {timeAgo(deployment.deployedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetailShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-[8px] last:border-b-0">
      <span className="label w-[86px] shrink-0">{label}</span>
      {children}
    </div>
  );
}

function RepositoryContext({ repo }: { repo: Repository }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={repo.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Details">
        <DefinitionList
          rows={[
            ['Provider', humanise(repo.provider)],
            ['Branch', repo.defaultBranch],
            ['Language', repo.language ?? '—'],
            ['Visibility', repo.isPrivate ? 'Private' : 'Public'],
            ['Deployments', String(repo.deployments?.length ?? 0)],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={repo.tags} href={(slug) => `/repositories?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={undefined} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={repo.createdAt} updated={repo.updatedAt} />
    </div>
  );
}
