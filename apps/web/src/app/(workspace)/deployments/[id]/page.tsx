'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, GitCommitHorizontal, RotateCcw, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { DEPLOYMENT_STATUS, humanise } from '@/lib/domain';
import type { Deployment } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine, StatusIndicator } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { CopyButton, Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { DeploymentEditor } from '../DeploymentEditor';

export default function DeploymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: deployment, loading, set } = useRecord<Deployment>(`/deployments/${id}`);

  const finish = useAction((status: string) =>
    api<Deployment>(`/deployments/${id}/finish`, { method: 'POST', body: { status } }),
  );

  useContextPanel('Deployment', deployment ? <DeploymentContext deployment={deployment} /> : null, [
    deployment?.id,
    deployment?.updatedAt,
  ]);

  if (loading && !deployment) return <LoadingLine message="Loading deployment…" />;
  if (!deployment) return null;

  if (editing) {
    return (
      <DeploymentEditor
        deployment={deployment}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  const running = deployment.status === 'IN_PROGRESS';

  return (
    <DetailShell
      title={<span className="mono">{deployment.version ?? 'Unversioned release'}</span>}
      eyebrow="Deployment"
      width="760px"
      onEdit={() => setEditing(true)}
      deletePath={`/deployments/${id}`}
      deleteBackTo="/deployments"
      deleteConfirm="Delete this deployment record?"
      actions={
        running && (
          <>
            <Button
              variant="primary"
              disabled={finish.busy}
              onClick={async () => {
                const saved = await finish.run('SUCCESS');
                if (saved) set(saved);
              }}
            >
              <CheckCircle2 size={13} /> Succeeded
            </Button>
            <Button
              variant="danger"
              disabled={finish.busy}
              onClick={async () => {
                const saved = await finish.run('FAILED');
                if (saved) set(saved);
              }}
            >
              <XCircle size={13} /> Failed
            </Button>
          </>
        )
      }
      meta={
        <>
          <StatusIndicator
            signal={DEPLOYMENT_STATUS[deployment.status]}
            label={humanise(deployment.status)}
            pulse={running}
          />
          {deployment.environment && <Badge>{deployment.environment.type}</Badge>}
          <span>{timeAgo(deployment.deployedAt)}</span>
          {deployment.project && (
            <Link
              href={`/projects/${deployment.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {deployment.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          {deployment.commitSha && (
            <Row label="Commit">
              <code className="mono flex min-w-0 flex-1 items-center gap-[6px] truncate text-[12px]">
                <GitCommitHorizontal size={12} className="shrink-0 text-[var(--text-faint)]" />
                {deployment.commitSha}
              </code>
              <CopyButton value={deployment.commitSha} label="" />
            </Row>
          )}
          <Row label="Repository">
            <span className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
              {deployment.repository ? (
                <Link
                  href={`/repositories/${deployment.repository.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {deployment.repository.name}
                </Link>
              ) : (
                '—'
              )}
            </span>
          </Row>
          <Row label="Server">
            <span className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
              {deployment.server ? (
                <Link
                  href={`/servers/${deployment.server.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {deployment.server.name}
                </Link>
              ) : (
                '—'
              )}
            </span>
          </Row>
          <Row label="Duration">
            <span className="mono min-w-0 flex-1 text-[12px] text-[var(--text-muted)]">
              {deployment.durationSec === null ? '—' : formatDuration(deployment.durationSec)}
            </span>
          </Row>
        </section>

        {deployment.status === 'ROLLED_BACK' && (
          <p className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)] px-3 py-2 text-[12.5px]">
            <RotateCcw size={13} className="mt-[2px] shrink-0 text-[var(--warning)]" />
            This release was rolled back. If you worked out why, record it as a solution so the next
            attempt does not repeat it.
          </p>
        )}

        {deployment.notes && <Markdown>{deployment.notes}</Markdown>}
      </div>
    </DetailShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-[8px] last:border-b-0">
      <span className="label w-[92px] shrink-0">{label}</span>
      {children}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function DeploymentContext({ deployment }: { deployment: Deployment }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={deployment.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Release">
        <DefinitionList
          rows={[
            ['Version', deployment.version ?? '—'],
            ['Commit', deployment.commitSha?.slice(0, 12) ?? '—'],
            ['Status', humanise(deployment.status)],
            ['By', deployment.deployedBy ?? '—'],
            ['When', timeAgo(deployment.deployedAt)],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Target">
        <DefinitionList
          rows={[
            ['Environment', deployment.environment?.name ?? '—'],
            ['Server', deployment.server?.name ?? '—'],
            ['Repository', deployment.repository?.name ?? '—'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={deployment.tags} href={(slug) => `/deployments?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={deployment.createdAt} updated={deployment.updatedAt} />
    </div>
  );
}
