'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Database, KeyRound, TerminalSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { SERVER_STATUS, humanise } from '@/lib/domain';
import type { Server } from '@/lib/types';
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
import { ServerEditor } from '../ServerEditor';

export default function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: server, loading, set } = useRecord<Server>(`/servers/${id}`);
  const ssh = useSshCommand(id);

  useContextPanel('Server', server ? <ServerContext server={server} /> : null, [
    server?.id,
    server?.updatedAt,
  ]);

  if (loading && !server) return <LoadingLine message="Loading server…" />;
  if (!server) return null;

  if (editing) {
    return (
      <ServerEditor
        server={server}
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
      title={server.name}
      eyebrow={`Server · ${humanise(server.provider)}`}
      onEdit={() => setEditing(true)}
      deletePath={`/servers/${id}`}
      deleteBackTo="/servers"
      deleteConfirm={`Remove "${server.name}"? Only the record goes — the machine is untouched.`}
      meta={
        <>
          <StatusIndicator
            signal={SERVER_STATUS[server.status]}
            label={humanise(server.status)}
            pulse={server.status === 'ONLINE'}
          />
          {server.environment && <Badge>{server.environment.type}</Badge>}
          {server.region && <span>{server.region}</span>}
          {server.project && (
            <Link href={`/projects/${server.project.slug}`} className="hover:text-[var(--accent)]">
              {server.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Hardware, read as one block — the numbers you compare between hosts. */}
        <section className="grid grid-cols-2 overflow-hidden rounded border border-line bg-[var(--surface-raised)] sm:grid-cols-4">
          <Cell label="CPU" value={server.cpuCores ? `${server.cpuCores} cores` : '—'} />
          <Cell label="Memory" value={server.ramGb ? `${server.ramGb} GB` : '—'} />
          <Cell label="Disk" value={server.diskGb ? `${server.diskGb} GB` : '—'} last />
          <Cell label="OS" value={server.os ?? '—'} last />
        </section>

        <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          {server.hostname && (
            <Row label="Hostname">
              <code className="mono min-w-0 flex-1 truncate text-[12px]">{server.hostname}</code>
              <CopyButton value={server.hostname} label="" />
            </Row>
          )}
          {server.ipAddress && (
            <Row label="IP address">
              <code className="mono min-w-0 flex-1 truncate text-[12px]">{server.ipAddress}</code>
              <CopyButton value={server.ipAddress} label="" />
            </Row>
          )}
          {ssh?.command && (
            <Row label="Connect">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                {ssh.command}
              </code>
              <CopyButton value={ssh.command} label="" />
            </Row>
          )}
        </section>

        {ssh?.note && (
          <p className="flex items-center gap-2 text-[11.5px] text-[var(--text-faint)]">
            <KeyRound size={12} /> {ssh.note}
          </p>
        )}

        {server.services.length > 0 && (
          <section>
            <div className="label mb-2">Services</div>
            <div className="flex flex-wrap gap-[5px]">
              {server.services.map((service) => (
                <span
                  key={service}
                  className="mono rounded-sm border border-line bg-[var(--surface-raised)] px-[7px] py-[3px] text-[11.5px] text-[var(--text-muted)]"
                >
                  {service}
                </span>
              ))}
            </div>
          </section>
        )}

        {server.databases && server.databases.length > 0 && (
          <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
            <div className="label flex h-8 items-center border-b border-line px-4">
              Databases on this host
            </div>
            <ul>
              {server.databases.map((database) => (
                <li key={database.id}>
                  <Link
                    href={`/databases/${database.id}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-[7px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                  >
                    <Database size={12} className="shrink-0 text-[var(--text-faint)]" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{database.name}</span>
                    <Badge>{database.type}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {server.notes && <Markdown>{server.notes}</Markdown>}

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          <TerminalSquare size={12} className="mt-[2px] shrink-0" />
          The connect line is text to copy. This application never opens a connection and never runs
          anything on your infrastructure.
        </p>
      </div>
    </DetailShell>
  );
}

function useSshCommand(id: string): { command: string; note?: string } | null {
  const [result, setResult] = useState<{ command: string; note?: string } | null>(null);
  useEffect(() => {
    api<{ command: string; note?: string }>(`/servers/${id}/ssh`)
      .then(setResult)
      .catch(() => setResult(null));
  }, [id]);
  return result;
}

function Cell({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-[5px] border-b border-line px-4 py-3 ${last ? '' : 'border-r'} sm:border-b-0`}
    >
      <span className="label">{label}</span>
      <span className="mono text-[12.5px]">{value}</span>
    </div>
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

function ServerContext({ server }: { server: Server }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={server.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Placement">
        <DefinitionList
          rows={[
            ['Provider', humanise(server.provider)],
            ['Region', server.region ?? '—'],
            [
              'Environment',
              server.environment ? (
                <Link
                  href={`/environments/${server.environment.id}`}
                  className="hover:text-[var(--accent)]"
                >
                  {server.environment.name}
                </Link>
              ) : (
                '—'
              ),
            ],
            ['Databases', String(server.databases?.length ?? 0)],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Access">
        <DefinitionList
          rows={[
            ['SSH user', server.sshUsername ?? '—'],
            ['SSH port', String(server.sshPort ?? 22)],
            [
              'Key',
              server.sshKey ? (
                <Link href={`/vault/${server.sshKey.id}`} className="hover:text-[var(--accent)]">
                  {server.sshKey.name}
                </Link>
              ) : (
                'Not linked'
              ),
            ],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={server.tags} href={(slug) => `/servers?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={undefined} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={server.createdAt} updated={server.updatedAt} />
    </div>
  );
}
