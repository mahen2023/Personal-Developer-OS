'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Globe, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { SslCertificate } from '@/lib/types';
import { useAction, useRecord } from '@/hooks/useResource';
import { Badge, Button, ExpiryIndicator, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
import {
  DefinitionList,
  DetailShell,
  PanelDivider,
  PanelSection,
  ProjectLink,
  TagList,
  Timestamps,
} from '@/components/patterns/DetailShell';
import { CertificateEditor } from '../CertificateEditor';

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [editing, setEditing] = useState(false);
  const { data: certificate, loading, set } = useRecord<SslCertificate>(`/certificates/${id}`);

  const renew = useAction(() =>
    api<SslCertificate>(`/certificates/${id}/renew`, { method: 'POST', body: {} }),
  );

  useContextPanel(
    'Certificate',
    certificate ? <CertificateContext certificate={certificate} /> : null,
    [certificate?.id, certificate?.updatedAt, certificate?.expiresAt],
  );

  if (loading && !certificate) return <LoadingLine message="Loading certificate…" />;
  if (!certificate) return null;

  if (editing) {
    return (
      <CertificateEditor
        certificate={certificate}
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
      title={<span className="mono">{certificate.commonName}</span>}
      eyebrow="SSL certificate"
      width="760px"
      onEdit={() => setEditing(true)}
      deletePath={`/certificates/${id}`}
      deleteBackTo="/certificates"
      deleteConfirm={`Remove the record for "${certificate.commonName}"?`}
      actions={
        <Button
          disabled={renew.busy}
          title="Records that you renewed it just now — 90 days from today"
          onClick={async () => {
            if (!window.confirm('Record a renewal now, valid for the next 90 days?')) return;
            const saved = await renew.run();
            if (saved) set(saved);
          }}
        >
          <RefreshCw size={13} /> Renewed
        </Button>
      }
      meta={
        <>
          {certificate.issuer && <span>{certificate.issuer}</span>}
          {certificate.autoRenew ? (
            <span className="text-[var(--success)]">auto-renew</span>
          ) : (
            <span className="text-[var(--warning)]">manual renewal</span>
          )}
          {certificate.environment && <Badge>{certificate.environment.type}</Badge>}
          {certificate.project && (
            <Link
              href={`/projects/${certificate.project.slug}`}
              className="hover:text-[var(--accent)]"
            >
              {certificate.project.name}
            </Link>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="flex items-center gap-4 rounded border border-line bg-[var(--surface-raised)] px-4 py-3">
          <ShieldCheck
            size={16}
            className={
              certificate.state === 'valid' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }
          />
          <ExpiryIndicator daysLeft={certificate.daysLeft} />
          <span className="mono ml-auto text-[11.5px] text-[var(--text-faint)]">
            {new Date(certificate.expiresAt).toLocaleDateString()}
          </span>
        </section>

        {certificate.domain && (
          <Link
            href={`/domains/${certificate.domain.id}`}
            className="flex items-center gap-2 rounded border border-line bg-[var(--surface-raised)] px-4 py-[9px] text-[12.5px] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Globe size={12} className="text-[var(--text-faint)]" />
            <span className="mono">{certificate.domain.name}</span>
            <span className="label ml-auto">domain</span>
          </Link>
        )}

        {certificate.notes && <Markdown>{certificate.notes}</Markdown>}

        <p className="text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          &quot;Renewed&quot; records that you renewed it elsewhere and moves the expiry 90 days
          out. This application never issues or installs certificates.
        </p>
      </div>
    </DetailShell>
  );
}

function CertificateContext({ certificate }: { certificate: SslCertificate }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={certificate.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Validity">
        <DefinitionList
          rows={[
            ['Issuer', certificate.issuer ?? '—'],
            ['Issued', certificate.issuedAt ? timeAgo(certificate.issuedAt) : '—'],
            ['Expires', timeAgo(certificate.expiresAt)],
            ['Auto-renew', certificate.autoRenew ? 'Yes' : 'No'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Covers">
        {certificate.domain ? (
          <Link
            href={`/domains/${certificate.domain.id}`}
            className="mono text-[12px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          >
            {certificate.domain.name}
          </Link>
        ) : (
          <p className="text-[12px] text-[var(--text-faint)]">Not linked to a recorded domain.</p>
        )}
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={certificate.tags} href={(slug) => `/certificates?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <Timestamps created={certificate.createdAt} updated={certificate.updatedAt} />
    </div>
  );
}
