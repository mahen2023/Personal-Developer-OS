import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { pathFor } from '../../search/search.service';
import { RetrievalService } from '../retrieval.service';
import type { PromptSource } from './prompt';
import { assertNoSecrets } from './modes';

/**
 * Everything the model is allowed to see, assembled per question (§15–§17, §40).
 *
 * Two paths, because the workspace holds two different kinds of thing:
 *
 *   Prose  — notes, solutions, ADRs, meetings, snippets, issues, documents.
 *            Retrieved by meaning from the chunk index, ranked, cited.
 *   Rows   — tasks, servers, databases, domains, deployments, repositories,
 *            environments. Never indexed, because a paraphrase of a hostname is
 *            worse than the hostname; listed as a compact brief instead.
 *
 * Neither path can reach a vault item. Vault rows are not indexed and are not
 * queried here, and `assertNoSecrets` drops the type even if a stored
 * conversation asks for it (§42). Infrastructure rows are selected column by
 * column below rather than with `include`, so a future column called
 * `password` cannot arrive here by being added to the schema.
 */

const INDEXED: EntityType[] = [
  EntityType.NOTE,
  EntityType.SOLUTION,
  EntityType.ISSUE,
  EntityType.ADR,
  EntityType.MEETING,
  EntityType.SNIPPET,
  EntityType.DOCUMENT,
];

/** Rows per type in the brief. Enough to be representative, short enough to read. */
const BRIEF_LIMIT = 25;

export interface BuiltContext {
  sources: PromptSource[];
  /** Project and inventory prose for the system turn. Null when there is none. */
  brief: string | null;
  /** What the console shows in the context panel (§53). */
  summary: {
    project: { id: string; name: string; slug: string } | null;
    counts: { label: string; value: number }[];
    retrieved: number;
    attached: number;
  };
}

@Injectable()
export class ContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
  ) {}

  async build(
    userId: string,
    options: {
      question: string;
      projectId: string | null;
      sources: EntityType[];
      attached: string[];
      limit?: number;
    },
  ): Promise<BuiltContext> {
    const selected = assertNoSecrets(options.sources);
    const retrievable = selected.filter((type) => INDEXED.includes(type));
    const structured = selected.filter((type) => !INDEXED.includes(type));

    const [project, pinned, passages] = await Promise.all([
      this.project(userId, options.projectId),
      this.attached(userId, options.attached),
      retrievable.length > 0
        ? this.retrieval.search(userId, options.question, {
            limit: options.limit ?? 6,
            projectId: options.projectId ?? undefined,
            types: retrievable,
          })
        : Promise.resolve([]),
    ]);

    // Attached records first and never deduplicated away: the developer chose
    // them, so they keep their place even when retrieval found them too.
    const pinnedIds = new Set(pinned.map((row) => row.entityId));
    const sources: PromptSource[] = [
      ...pinned,
      ...passages
        .filter((passage) => !pinnedIds.has(passage.entityId))
        .map((passage) => ({
          index: 0,
          entityType: passage.entityType,
          entityId: passage.entityId,
          title: passage.title,
          content: passage.content,
          href: pathFor(passage.entityType, passage.entityId),
          score: Number(passage.score.toFixed(3)),
          pinned: false,
        })),
    ].map((source, index) => ({ ...source, index: index + 1 }));

    const inventory = await this.brief(userId, options.projectId, structured);
    const parts = [project?.prose, inventory].filter(Boolean);

    return {
      sources,
      brief: parts.length > 0 ? parts.join('\n\n') : null,
      summary: {
        project: project ? { id: project.id, name: project.name, slug: project.slug } : null,
        counts: project?.counts ?? [],
        retrieved: sources.length - pinned.length,
        attached: pinned.length,
      },
    };
  }

  /** The project as prose, plus the counts the context panel shows. */
  private async project(userId: string, projectId: string | null) {
    if (!projectId) return null;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: {
        _count: {
          select: {
            notes: true,
            solutions: true,
            adrs: true,
            documents: true,
            tasks: true,
            issues: true,
            servers: true,
            repositories: true,
          },
        },
      },
    });
    if (!project) return null;

    const counts = [
      ['Notes', project._count.notes],
      ['Solutions', project._count.solutions],
      ['ADRs', project._count.adrs],
      ['Documents', project._count.documents],
      ['Tasks', project._count.tasks],
      ['Issues', project._count.issues],
      ['Servers', project._count.servers],
      ['Repositories', project._count.repositories],
    ] as const;

    const facts = [
      `Name: ${project.name}`,
      `Status: ${project.status}`,
      project.description ? `Description: ${project.description}` : null,
      project.techStack.length > 0 ? `Stack: ${project.techStack.join(', ')}` : null,
      `Recorded: ${counts
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${value} ${label.toLowerCase()}`)
        .join(', ')}`,
    ].filter(Boolean);

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      prose: facts.join('\n'),
      counts: counts.map(([label, value]) => ({ label, value })),
    };
  }

  /**
   * Records the developer attached by hand, as `TYPE:uuid` pairs (§17).
   *
   * Read from the index rather than the tables: a record's chunks are already
   * the prose form of it, so this needs no second set of loaders that would
   * drift from the indexer's.
   */
  private async attached(userId: string, refs: string[]): Promise<PromptSource[]> {
    if (refs.length === 0) return [];

    const wanted = refs
      .map((ref) => {
        const [type, id] = ref.split(':');
        return { type: type as EntityType, id };
      })
      .filter((ref) => ref.id && ref.type !== EntityType.VAULT_ITEM);
    if (wanted.length === 0) return [];

    const chunks = await this.prisma.chunk.findMany({
      where: { userId, OR: wanted.map((ref) => ({ entityType: ref.type, entityId: ref.id })) },
      orderBy: { ordinal: 'asc' },
    });

    // One entry per record, its chunks stitched back in order — an attached
    // record is meant to be present in full, not as its best paragraph.
    const byRecord = new Map<string, PromptSource>();
    for (const row of chunks) {
      const key = `${row.entityType}:${row.entityId}`;
      const existing = byRecord.get(key);
      if (existing) {
        existing.content = `${existing.content}\n${row.content}`;
        continue;
      }
      byRecord.set(key, {
        index: 0,
        entityType: row.entityType,
        entityId: row.entityId,
        title: row.title,
        content: row.content,
        href: pathFor(row.entityType, row.entityId),
        score: 1,
        pinned: true,
      });
    }

    // In the order the developer attached them.
    return wanted
      .map((ref) => byRecord.get(`${ref.type}:${ref.id}`))
      .filter((row): row is PromptSource => Boolean(row));
  }

  /**
   * The inventory, one line per row.
   *
   * Columns are named explicitly. `servers.sshKeyId` and `databases.credentialId`
   * are references to vault items, not values, and they are still not selected —
   * a reference tells the model which secret exists, which is all §42 allows.
   */
  private async brief(
    userId: string,
    projectId: string | null,
    types: EntityType[],
  ): Promise<string | null> {
    if (types.length === 0) return null;
    const scope = { userId, ...(projectId ? { projectId } : {}) };
    const take = BRIEF_LIMIT;
    const blocks: string[] = [];

    if (types.includes(EntityType.TASK)) {
      const rows = await this.prisma.task.findMany({
        where: { ...scope, status: { not: 'DONE' } },
        select: { title: true, status: true, priority: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
        take,
      });
      blocks.push(
        section(
          'OPEN TASKS',
          rows.map(
            (row) =>
              `${row.title} — ${row.status}, ${row.priority}${row.dueDate ? `, due ${day(row.dueDate)}` : ''}`,
          ),
        ),
      );
    }

    if (types.includes(EntityType.SERVER)) {
      const rows = await this.prisma.server.findMany({
        where: scope,
        select: {
          name: true,
          hostname: true,
          ipAddress: true,
          provider: true,
          status: true,
          os: true,
          services: true,
        },
        take,
      });
      blocks.push(
        section(
          'SERVERS',
          rows.map(
            (row) =>
              `${row.name} — ${row.hostname ?? row.ipAddress ?? 'no address recorded'}, ${row.provider}, ${row.status}${row.os ? `, ${row.os}` : ''}${row.services.length ? `, running ${row.services.join(', ')}` : ''}`,
          ),
        ),
      );
    }

    if (types.includes(EntityType.DATABASE)) {
      const rows = await this.prisma.databaseInstance.findMany({
        where: scope,
        select: { name: true, type: true, version: true, host: true, port: true },
        take,
      });
      blocks.push(
        section(
          'DATABASES',
          rows.map(
            (row) =>
              `${row.name} — ${row.type}${row.version ? ` ${row.version}` : ''} at ${row.host ?? 'unrecorded host'}${row.port ? `:${row.port}` : ''}`,
          ),
        ),
      );
    }

    if (types.includes(EntityType.DOMAIN)) {
      const rows = await this.prisma.domain.findMany({
        where: scope,
        select: { name: true, registrar: true, expiresAt: true, autoRenew: true },
        take,
      });
      blocks.push(
        section(
          'DOMAINS',
          rows.map(
            (row) =>
              `${row.name}${row.registrar ? ` — ${row.registrar}` : ''}${row.expiresAt ? `, expires ${day(row.expiresAt)}` : ''}${row.autoRenew ? ', auto-renew on' : ''}`,
          ),
        ),
      );
    }

    if (types.includes(EntityType.DEPLOYMENT)) {
      const rows = await this.prisma.deployment.findMany({
        where: scope,
        select: { version: true, status: true, deployedAt: true, notes: true },
        orderBy: { deployedAt: 'desc' },
        take,
      });
      blocks.push(
        section(
          'RECENT DEPLOYMENTS',
          rows.map(
            (row) =>
              `${row.version ?? 'unversioned'} — ${row.status}${row.deployedAt ? ` on ${day(row.deployedAt)}` : ''}${row.notes ? `: ${row.notes}` : ''}`,
          ),
        ),
      );
    }

    if (types.includes(EntityType.ENVIRONMENT)) {
      const rows = await this.prisma.environment.findMany({
        where: scope,
        select: { name: true, type: true, baseUrl: true },
        take,
      });
      blocks.push(
        section(
          'ENVIRONMENTS',
          rows.map((row) => `${row.name} — ${row.type}${row.baseUrl ? `, ${row.baseUrl}` : ''}`),
        ),
      );
    }

    if (types.includes(EntityType.REPOSITORY)) {
      const rows = await this.prisma.repository.findMany({
        where: scope,
        select: { name: true, provider: true, url: true, language: true, defaultBranch: true },
        take,
      });
      blocks.push(
        section(
          'REPOSITORIES',
          rows.map(
            (row) =>
              `${row.name} — ${row.provider}${row.language ? `, ${row.language}` : ''}${row.defaultBranch ? `, default branch ${row.defaultBranch}` : ''}${row.url ? `, ${row.url}` : ''}`,
          ),
        ),
      );
    }

    const filled = blocks.filter(Boolean);
    return filled.length > 0 ? filled.join('\n\n') : null;
  }
}

function section(heading: string, lines: string[]): string {
  // An empty section is worse than a missing one: it invites the model to fill
  // the gap. Saying "none recorded" is a fact it can repeat.
  return lines.length === 0
    ? `${heading}\nNone recorded.`
    : `${heading}\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
