'use client';

import Link from 'next/link';
import { ExternalLink, FolderGit2, GitBranch, Plus } from 'lucide-react';
import { REPO_PROVIDERS, enumOptions, humanise } from '@/lib/domain';
import type { Repository } from '@/lib/types';
import { useList, useListQuery } from '@/hooks/useResource';
import { Button, EmptyState } from '@/components/primitives';
import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  Toolbar,
} from '@/components/patterns/PageShell';
import { MonoCell, ProjectCell, TimeCell } from '@/components/patterns/DetailShell';

export default function RepositoriesPage() {
  const { values, set, queryString } = useListQuery({ limit: '25' });
  const { data, loading } = useList<Repository>('/repositories', queryString);

  const columns: Column<Repository>[] = [
    {
      key: 'name',
      header: 'Repository',
      render: (repo) => (
        <span className="flex min-w-0 flex-col gap-[1px]">
          <span className="flex items-center gap-2">
            <FolderGit2 size={12} className="shrink-0 text-[var(--text-faint)]" />
            <span className="truncate text-[12.5px]">{repo.name}</span>
          </span>
          <span className="mono truncate text-[11px] text-[var(--text-faint)]">{repo.url}</span>
        </span>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      width: '104px',
      hideBelow: 'lg',
      render: (repo) => <MonoCell value={repo.language} />,
    },
    {
      key: 'branch',
      header: 'Branch',
      width: '104px',
      hideBelow: 'md',
      render: (repo) => (
        <span className="mono flex items-center gap-[5px] truncate text-[11px] text-[var(--text-faint)]">
          <GitBranch size={10} className="shrink-0" />
          {repo.defaultBranch}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      width: '140px',
      hideBelow: 'md',
      render: (repo) => <ProjectCell project={repo.project} />,
    },
    {
      key: 'provider',
      header: 'Provider',
      width: '96px',
      hideBelow: 'sm',
      render: (repo) => <MonoCell value={humanise(repo.provider)} />,
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '84px',
      align: 'right',
      render: (repo) => <TimeCell value={repo.updatedAt} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
      <PageHeader
        icon={FolderGit2}
        title="Repositories"
        subtitle="Where the code lives, and what it deploys to."
        count={data?.total}
        actions={
          <Link href="/repositories/new">
            <Button variant="primary">
              <Plus size={13} /> Add repository
            </Button>
          </Link>
        }
      />

      <Toolbar>
        <SearchField
          value={values.q ?? ''}
          onChange={(q) => set({ q })}
          placeholder="Search names, URLs and local paths…"
        />
        <FilterSelect
          label="Provider"
          value={values.provider ?? ''}
          onChange={(provider) => set({ provider })}
          options={enumOptions(REPO_PROVIDERS, 'Any')}
        />
      </Toolbar>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        loading={loading}
        href={(repo) => `/repositories/${repo.id}`}
        empty={
          <EmptyState
            icon={FolderGit2}
            title={values.q ? 'Nothing matches' : 'No repositories yet'}
            description={
              values.q
                ? 'No repository matches those filters.'
                : 'Record where each project’s code lives — including the local path, which is the thing you actually forget after a laptop rebuild.'
            }
            connects={
              values.q
                ? undefined
                : [
                    'provider, URL and default branch',
                    'the local path on this machine',
                    'the deployments that came from it',
                  ]
            }
            action={
              <Link href="/repositories/new">
                <Button variant="primary">
                  <Plus size={13} /> Add a repository
                </Button>
              </Link>
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

      <p className="mt-3 flex items-center gap-[6px] text-[11.5px] text-[var(--text-faint)]">
        <ExternalLink size={11} />
        Live commits, pull requests and CI status arrive in phase 8. Everything here works without
        connecting to any provider.
      </p>
    </div>
  );
}
