'use client';

import { use } from 'react';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import type { DocumentRecord } from '@/lib/types';
import { useRecord } from '@/hooks/useResource';
import { Badge, Button, LoadingLine } from '@/components/primitives';
import { useContextPanel } from '@/components/shell/ContextPanel';
import { Markdown } from '@/components/patterns/Markdown';
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

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: document, loading } = useRecord<DocumentRecord>(`/documents/${id}`);
  const href = `/api/documents/${id}/download`;

  useContextPanel('Document', document ? <DocumentContext document={document} /> : null, [
    document?.id,
    document?.updatedAt,
  ]);

  if (loading && !document) return <LoadingLine message="Loading document…" />;
  if (!document) return null;

  return (
    <DetailShell
      title={document.originalName}
      eyebrow={`Document · ${document.kind}`}
      deletePath={`/documents/${id}`}
      deleteBackTo="/documents"
      deleteConfirm={`Delete ${document.originalName}? The file is removed too.`}
      actions={
        <a href={href} download>
          <Button>
            <Download size={13} /> Download
          </Button>
        </a>
      }
      meta={
        <>
          <Badge>{document.mimeType}</Badge>
          <span>{formatBytes(document.sizeBytes)}</span>
          {document.checksum && <span>sha256 {document.checksum.slice(0, 12)}</span>}
        </>
      }
    >
      <Preview document={document} href={href} />
    </DetailShell>
  );
}

/**
 * What the browser can paint, painted; what it cannot, said plainly.
 *
 * Images go through an `<img>`, which ignores Content-Disposition and never
 * executes an embedded script — so even an SVG is safe here. A PDF needs the
 * `inline` opt-in, which the API grants only to types that cannot run code.
 * Everything else falls back to the text pulled out at upload time.
 */
function Preview({ document, href }: { document: DocumentRecord; href: string }) {
  const frame = 'overflow-hidden rounded border border-line bg-[var(--surface-raised)]';

  if (document.mimeType.startsWith('image/')) {
    return (
      <div className={`${frame} flex justify-center p-4`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={document.originalName} className="max-h-[70vh] w-auto" />
      </div>
    );
  }

  if (document.mimeType === 'application/pdf') {
    return (
      <object
        data={`${href}?inline=1`}
        type="application/pdf"
        className={`${frame} h-[75vh] w-full`}
      >
        <Unrenderable
          href={href}
          message="This browser will not display the PDF here. Download it to read it."
        />
      </object>
    );
  }

  if (document.extractedText) {
    // A workbook is extracted as one Markdown table per sheet, so it renders
    // through the same component a note does.
    return document.mimeType === 'text/markdown' || document.mimeType.includes('spreadsheetml') ? (
      <div className="overflow-x-auto">
        <Markdown>{document.extractedText}</Markdown>
      </div>
    ) : (
      <pre className={`mono ${frame} max-h-[75vh] overflow-auto p-4 text-[12px] leading-relaxed`}>
        {document.extractedText}
      </pre>
    );
  }

  return <Unrenderable href={href} message={LEGACY[document.mimeType] ?? unreadable(document)} />;
}

/**
 * .doc and .xls are the pre-2007 binary format — a different thing wearing the
 * same name as .docx and .xlsx. Saying that is more use than "cannot preview",
 * which reads like the file is damaged.
 */
const LEGACY: Record<string, string> = {
  'application/msword':
    'This is a pre-2007 .doc, a binary format nothing here can read. Re-save it as .docx and it will preview.',
  'application/vnd.ms-excel':
    'This is a pre-2007 .xls, a binary format nothing here can read. Re-save it as .xlsx and it will preview.',
};

function unreadable(document: DocumentRecord): string {
  return `A ${document.kind} file has nothing to show in a browser. The original is stored intact.`;
}

function Unrenderable({ href, message }: { href: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-line bg-[var(--surface-raised)] px-6 py-10 text-center">
      <FileText size={20} className="text-[var(--text-faint)]" />
      <p className="max-w-[380px] text-[12.5px] text-[var(--text-muted)]">{message}</p>
      <a href={href} download>
        <Button variant="primary">
          <Download size={13} /> Download
        </Button>
      </a>
    </div>
  );
}

function DocumentContext({ document }: { document: DocumentRecord }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <PanelSection title="Filed under">
        <ProjectLink project={document.project} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="File">
        <DefinitionList
          rows={[
            ['Type', document.kind],
            ['Size', formatBytes(document.sizeBytes)],
            ['Stored as', document.fileName],
            ['Text', document.extractedText ? 'Extracted and indexed' : 'None'],
          ]}
        />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Tags">
        <TagList tags={document.tags} href={(slug) => `/documents?tags=${slug}`} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Linked">
        <LinkedRecords links={document.links} />
      </PanelSection>

      <PanelDivider />
      <PanelSection title="Integrity">
        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
          <ShieldCheck size={12} className="mt-[2px] shrink-0" />
          Downloads are served as an attachment. Only PDFs and raster images are ever rendered in
          place.
        </p>
      </PanelSection>

      <PanelDivider />
      <Timestamps created={document.createdAt} updated={document.updatedAt} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
