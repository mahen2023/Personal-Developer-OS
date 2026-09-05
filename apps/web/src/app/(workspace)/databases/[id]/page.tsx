'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { HardDriveDownload, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { BACKUP_SIGNAL, humanise } from '@/lib/domain';
import type { DatabaseInstance } from '@/lib/types';
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
import { DatabaseEditor } from '../DatabaseEditor';

export default function DatabasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: database, loading, set } = useRecord<DatabaseInstance>(`/databases/${id}`);

  const markBackedUp = useAction(() =>
    api<DatabaseInstance>(`/databases/${id}/backed-up`, { method: 'POST' }),
  );

  useContextPanel('Database', database ? <DatabaseContext database={database} /> : null, [
    database?.id,
    database?.updatedAt,
    database?.lastBackupAt,
  ]);

  if (loading && !database) return <LoadingLine message="Loading database…" />;
  if (!database) return null;

  if (editing) {
    return (
      <DatabaseEditor
        database={database}
        onCancel={() => setEditing(false)}
        onDone={(saved) => {
          set(saved);
          setEditing(false);
        }}
      />
    );
  }

  const backup = BACKUP_SIGNAL[database.backupStatus] ?? BACKUP_SIGNAL.none;

  return (
    <DetailShell
      title={database.name}
      eyebrow={`Database · ${humanise(database.type)}`}
      onEdit={() => setEditing(true)}
      deletePath={`/databases/${id}`}
      deleteBackTo="/databases"
      deleteConfirm={`Remove "${database.name}"? Only the record goes — the database is untouched.`}
      actions={
        <Button
          disabled={markBackedUp.busy}
          onClick={async () => {
            const saved = await markBackedUp.run();
            if (saved) set(saved);
          }}
          title="Records that you ran a backup just now"
        >
          <HardDriveDownload size={13} /> Backed up
        </Button>
      }
      meta={
        <>
          <StatusIndicator signal={backup.signal} label={backup.label} />
          {database.environment && <Badge>{database.environment.type}</Badge>}
          {database.project && (
            <Link
              href={`/projects/${database.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {database.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          <Row label="Host">
            <code className="mono min-w-0 flex-1 truncate text-[12px]">
              {database.host ?? '—'}
              {database.port ? `:${database.port}` : ''}
            </code>
            {database.host && (
              <CopyButton value={`${database.host}:${database.port ?? ''}`} label="" />
            )}
          </Row>
          <Row label="Database">
            <code className="mono min-w-0 flex-1 truncate text-[12px]">
              {database.databaseName ?? '—'}
            </code>
          </Row>
          <Row label="User">
            <code className="mono min-w-0 flex-1 truncate text-[12px]">
              {database.username ?? '—'}
            </code>
          </Row>
          {database.connectionHint && (
            <Row label="Connection">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                {database.connectionHint}
              </code>
              <CopyButton value={database.connectionHint} label="" />
            </Row>
          )}
        </section>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          <ShieldCheck size={12} className="mt-[2px] shrink-0" />
          The connection string leaves the password as{' '}
          <code className="mono">&lt;password&gt;</code> deliberately.{' '}
          {database.credential ? (
            <>
              The real one is in the vault as{' '}
              <Link
                href={`/vault/${database.credential.id}`}
                className="hover:text-[var(--accent)]"
              >
                {database.credential.name}
              </Link>
              .
            </>
          ) : (
            'No credential is linked yet.'
          )}
        </p>

        {database.notes && <Markdown>{database.notes}</Markdown>}
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

function DatabaseContext({ database }: { database: DatabaseInstance }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={database.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Placement">
        <DefinitionList
          rows={[
            [
              'Server',
              database.server ? (
                <Link
                  href={`/servers/${database.server.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {database.server.name}
                </Link>
              ) : (
                '—'
              ),
            ],
            [
              'Environment',
              database.environment ? (
                <Link
                  href={`/environments/${database.environment.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {database.environment.name}
                </Link>
              ) : (
                '—'
              ),
            ],
            ['Engine', `${humanise(database.type)} ${database.version ?? ''}`.trim()],
            ['Size', database.sizeMb ? `${(database.sizeMb / 1024).toFixed(1)} GB` : '—'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Backups">
        <DefinitionList
          rows={[
            ['Schedule', database.backupSchedule ?? 'None recorded'],
            ['Last run', database.lastBackupAt ? timeAgo(database.lastBackupAt) : 'Never'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={database.tags} href={(slug) => `/databases?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={database.createdAt} updated={database.updatedAt} />
    </div>
  );
}
