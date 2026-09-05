'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { DocumentRecord } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
import {
  type Column,
  DataTable,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { FormError, ProjectSelect } from '@/components/patterns/Form';

export default function DocumentsPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading, reload } = useList<DocumentRecord>('/documents', queryString);
  const [projectId, setProjectId] = useState<string | null>(values.projectId ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('file', file);
      if (projectId) body.append('projectId', projectId);
      try {
        // FormData must not carry a Content-Type header — the browser sets the
        // multipart boundary, and overriding it breaks the parse.
        const response = await fetch('/api/documents', { method: 'POST', body });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new ApiError(payload.message ?? 'Upload failed.', response.status, payload.errorId);
        }
      } catch (caught) {
        setError(caught instanceof ApiError ? caught : new ApiError('Upload failed.', 0));
        break;
      }
    }

    setUploading(false);
    if (input.current) input.current.value = '';
    reload();
  }

  const columns: Column<DocumentRecord>[] = [
    {
      key: 'name',
      header: 'Document',
      render: (document) => (
        <span className="flex min-w-0 items-center gap-2">
          <FileText size={12} className="shrink-0 text-[var(--text-faint)]" />
          <span className="truncate text-[12.5px]">{document.originalName}</span>
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      width: '86px',
      hideBelow: 'sm',
      render: (document) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">{document.kind}</span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '150px',
      hideBelow: 'md',
      render: (document) =>
        document.project ? (
          <span className="truncate text-[12px] text-[var(--text-muted)]">
            {document.project.name}
          </span>
        ) : (
          <span className="text-[11.5px] text-[var(--text-faint)]">Unfiled</span>
        ),
    },
    {
      key: 'size',
      header: 'Size',
      width: '74px',
      align: 'right',
      hideBelow: 'sm',
      render: (document) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {formatBytes(document.sizeBytes)}
        </span>
      ),
    },
    {
      key: 'added',
      header: 'Added',
      width: '82px',
      align: 'right',
      render: (document) => (
        <span className="mono text-[11px] text-[var(--text-faint)]">
          {timeAgo(document.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '58px',
      align: 'right',
      render: (document) => (
        <span className="flex items-center justify-end gap-1">
          <a
            href={`/api/documents/${document.id}/download`}
            onClick={(event) => event.stopPropagation()}
            title="Download"
            className="text-[var(--text-faint)] hover:text-[var(--accent)]"
          >
            <Download size={12} />
          </a>
          <button
            title="Delete"
            onClick={async (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!window.confirm(`Delete ${document.originalName}? The file is removed too.`))
                return;
              await api(`/documents/${document.id}`, { method: 'DELETE' }).catch(() => undefined);
              reload();
            }}
            className="text-[var(--text-faint)] hover:text-[var(--danger)]"
          >
            <Trash2 size={12} />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div
      className="mx-auto max-w-[1180px] px-6 pb-16 pt-6"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void upload(event.dataTransfer.files);
      }}
    >
      <PageHeader
        icon={FileText}
        title="Documents"
        subtitle="PDFs, spreadsheets, diagrams and markdown, attached to what they describe."
        count={data?.total}
        actions={
          <Button variant="primary" disabled={uploading} onClick={() => input.current?.click()}>
            <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        }
      />

      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Filter by name…"
        />
        <div className="w-[220px]">
          <ProjectSelect
            value={projectId}
            onChange={(value) => {
              setProjectId(value);
              set({ projectId: value ?? undefined });
            }}
          />
        </div>
      </Toolbar>

      {error && (
        <div className="mb-3">
          <FormError error={error} />
        </div>
      )}

      {dragging && (
        <div className="mb-3 rounded border border-dashed border-[var(--accent-line)] bg-[var(--accent-dim)] px-4 py-6 text-center text-[12.5px] text-[var(--accent)]">
          Drop to upload{projectId ? ' into the selected project' : ''}
        </div>
      )}

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(document) => `/documents/${document.id}`}
        empty={
          <EmptyState
            icon={FileText}
            title={values.q ? 'Nothing matches' : 'No documents yet'}
            description={
              values.q
                ? 'No document matches that filter.'
                : 'Drop a file anywhere on this page, or use Upload. Documents attach to a project and stay searchable by name.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'PDF, DOCX, XLSX, CSV, JSON',
                    'markdown and plain text',
                    'PNG, JPEG, GIF, WebP, SVG',
                  ]
            }
            action={
              <Button variant="primary" onClick={() => input.current?.click()}>
                <Upload size={13} /> Upload a file
              </Button>
            }
          />
        }
      />

      {data && (
        <Pager
          page={data.page}
          pages={data.pages}
          total={data.total}
          onChange={(page) => set({ page: String(page) })}
        />
      )}

      <p className="mt-3 text-[11.5px] text-[var(--text-faint)]">
        Files are stored on this machine under <span className="mono">STORAGE_LOCAL_PATH</span>.
        Downloads are always served as an attachment, never rendered inline.{' '}
        <Link href="/settings" className="hover:text-[var(--accent)]">
          Storage settings
        </Link>
      </p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
