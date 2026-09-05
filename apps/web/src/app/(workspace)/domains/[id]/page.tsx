'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import type { Domain } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, ExpiryIndicator, LoadingLine } from '@/components/primitives';
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
import { DomainEditor } from '../DomainEditor';

export default function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: domain, loading, set } = useRecord<Domain>(`/domains/${id}`);

  useContextPanel('Domain', domain ? <DomainContext domain={domain} /> : null, [
    domain?.id,
    domain?.updatedAt,
  ]);

  if (loading && !domain) return <LoadingLine message="Loading domain…" />;
  if (!domain) return null;

  if (editing) {
    return (
      <DomainEditor
        domain={domain}
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
      title={<span className="mono">{domain.name}</span>}
      eyebrow="Domain"
      width="760px"
      onEdit={() => setEditing(true)}
      deletePath={`/domains/${id}`}
      deleteBackTo="/domains"
      deleteConfirm={`Remove "${domain.name}"? Only the record goes — the registration is untouched.`}
      meta={
        <>
          {domain.registrar && <span>{domain.registrar}</span>}
          {domain.autoRenew ? (
            <span className="flex items-center gap-[4px] text-[var(--success)]">
              <RefreshCw size={10} /> auto-renew
            </span>
          ) : (
            <span className="text-[var(--warning)]">manual renewal</span>
          )}
          {domain.environment && <Badge>{domain.environment.type}</Badge>}
          {domain.project && (
            <Link href={`/projects/${domain.project.slug}`} className="hover:text-[var(--accent)]">
              {domain.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="flex items-center gap-4 rounded border border-line bg-[var(--surface-raised)] px-4 py-3">
          <ExpiryIndicator daysLeft={domain.daysLeft} />
          <span className="mono ml-auto text-[11.5px] text-[var(--text-faint)]">
            {domain.expiresAt
              ? new Date(domain.expiresAt).toLocaleDateString()
              : 'no expiry recorded'}
          </span>
        </section>

        <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-[8px] last:border-b-0">
            <span className="label w-[92px] shrink-0">Open</span>
            <a
              href={`https://${domain.name}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mono flex min-w-0 flex-1 items-center gap-[6px] truncate text-[12px] text-[var(--info)] hover:underline"
            >
              https://{domain.name} <ExternalLink size={11} className="shrink-0" />
            </a>
            <CopyButton value={domain.name} label="" />
          </div>
          <div className="flex items-center gap-3 px-4 py-[8px]">
            <span className="label w-[92px] shrink-0">DNS</span>
            <span className="mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
              {domain.dnsProvider ?? '—'}
            </span>
          </div>
        </section>

        {domain.certificates && domain.certificates.length > 0 && (
          <section className="overflow-hidden rounded border border-line bg-[var(--surface-raised)]">
            <div className="label flex h-8 items-center border-b border-line px-4">
              Certificates
            </div>
            <ul>
              {domain.certificates.map((certificate) => (
                <li key={certificate.id}>
                  <Link
                    href={`/certificates/${certificate.id}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-[8px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                  >
                    <ShieldCheck size={12} className="shrink-0 text-[var(--text-faint)]" />
                    <span className="mono min-w-0 flex-1 truncate text-[12px]">
                      {certificate.commonName}
                    </span>
                    <span className="mono text-[11px] text-[var(--text-faint)]">
                      {certificate.issuer ?? ''}
                    </span>
                    <span className="mono w-[92px] shrink-0 text-right text-[11px] text-[var(--text-faint)]">
                      {timeAgo(certificate.expiresAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {domain.notes && <Markdown>{domain.notes}</Markdown>}
      </div>
    </DetailShell>
  );
}

function DomainContext({ domain }: { domain: Domain }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={domain.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Registration">
        <DefinitionList
          rows={[
            ['Registrar', domain.registrar ?? '—'],
            ['DNS', domain.dnsProvider ?? '—'],
            ['Auto-renew', domain.autoRenew ? 'Yes' : 'No'],
            ['Expires', domain.expiresAt ? timeAgo(domain.expiresAt) : 'Not recorded'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Certificates">
        {domain.certificates && domain.certificates.length > 0 ? (
          <ul className="flex flex-col gap-[3px]">
            {domain.certificates.map((certificate) => (
              <li key={certificate.id}>
                <Link
                  href={`/certificates/${certificate.id}`}
                  className="mono truncate text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                >
                  {certificate.commonName}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[var(--text-faint)]">None recorded for this domain.</p>
        )}
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={domain.tags} href={(slug) => `/domains?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={domain.createdAt} updated={domain.updatedAt} />
    </div>
  );
}
