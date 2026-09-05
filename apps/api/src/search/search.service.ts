import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TagsService } from '../tags/tags.service';
import { SearchQueryDto } from './search.dto';

export interface SearchHit {
  type: EntityType;
  id: string;
  title: string;
  snippet?: string;
  detail?: string;
  href: string;
  projectId: string | null;
  updatedAt: string;
  score: number;
}

interface Searchable {
  delegate: string;
  /** Columns matched by `?q=`. The first is treated as the title. */
  fields: readonly string[];
  /** Column shown under the title, when it adds anything. */
  detail?: string;
  path: string;
  /** Column the results are ordered and dated by. */
  stamp?: string;
  /** False for Project itself, which has no projectId — it is the project. */
  scoped?: false;
}

/**
 * The search index, such as it is. Postgres `ILIKE` over the columns that
 * actually carry meaning, per entity type.
 *
 * This is deliberately not a full-text or vector index yet: with a personal
 * corpus, `pg_trgm`-backed ILIKE returns in single-digit milliseconds and needs
 * no index to maintain, no reindex job and no drift between the row and its
 * copy. Phase 6 adds semantic search alongside this, not instead of it —
 * "find the note containing MONGO_URI" is a job for exact matching, forever.
 */
const SEARCHABLE: Partial<Record<EntityType, Searchable>> = {
  PROJECT: {
    delegate: 'project',
    fields: ['name', 'description', 'client'],
    detail: 'status',
    path: '/projects',
    scoped: false,
  },
  NOTE: { delegate: 'note', fields: ['title', 'content'], detail: 'type', path: '/notes' },
  TASK: {
    delegate: 'task',
    fields: ['title', 'description', 'assignee'],
    detail: 'status',
    path: '/tasks',
  },
  SOLUTION: {
    delegate: 'solution',
    fields: ['title', 'problem', 'errorMessage', 'rootCause', 'solution'],
    detail: 'environment',
    path: '/solutions',
  },
  ISSUE: {
    delegate: 'issue',
    fields: ['title', 'description', 'errorMessage'],
    detail: 'status',
    path: '/issues',
  },
  SNIPPET: {
    delegate: 'snippet',
    fields: ['title', 'code', 'description'],
    detail: 'language',
    path: '/snippets',
  },
  COMMAND: {
    delegate: 'command',
    fields: ['title', 'command', 'description'],
    detail: 'category',
    path: '/commands',
  },
  ADR: {
    delegate: 'adr',
    fields: ['title', 'context', 'decision'],
    detail: 'status',
    path: '/adrs',
  },
  MEETING: {
    delegate: 'meeting',
    fields: ['title', 'discussion', 'decisions'],
    path: '/meetings',
    stamp: 'meetingDate',
  },
  REPOSITORY: {
    delegate: 'repository',
    fields: ['name', 'description', 'url'],
    detail: 'provider',
    path: '/repositories',
  },
  SERVER: {
    delegate: 'server',
    fields: ['name', 'hostname', 'ipAddress', 'notes'],
    detail: 'provider',
    path: '/servers',
  },
  DATABASE: {
    delegate: 'databaseInstance',
    fields: ['name', 'host', 'databaseName', 'notes'],
    detail: 'type',
    path: '/databases',
  },
  ENVIRONMENT: {
    delegate: 'environment',
    fields: ['name', 'baseUrl', 'notes'],
    detail: 'type',
    path: '/environments',
  },
  DOMAIN: {
    delegate: 'domain',
    fields: ['name', 'registrar', 'notes'],
    detail: 'dnsProvider',
    path: '/domains',
  },
  DEPLOYMENT: {
    delegate: 'deployment',
    fields: ['version', 'commitSha', 'notes'],
    detail: 'status',
    path: '/deployments',
    stamp: 'deployedAt',
  },
  DOCUMENT: {
    delegate: 'document',
    fields: ['originalName'],
    detail: 'mimeType',
    path: '/documents',
  },
  BOOKMARK: {
    delegate: 'bookmark',
    fields: ['title', 'url', 'description'],
    detail: 'category',
    path: '/bookmarks',
  },
  LEARNING: {
    delegate: 'learningItem',
    fields: ['title', 'technology', 'notes'],
    detail: 'status',
    path: '/learning',
  },
  IDEA: {
    delegate: 'idea',
    fields: ['title', 'description'],
    detail: 'status',
    path: '/ideas',
  },
  // Vault items are searchable by their non-secret metadata only. `cipher` is
  // never a search field, and never will be.
  VAULT_ITEM: {
    delegate: 'vaultItem',
    fields: ['name', 'username', 'url'],
    detail: 'type',
    path: '/vault',
  },
};

/**
 * Where a record of each type lives in the UI. Exported because Phase 6 cites
 * the same records from AI answers, and two lists of routes would drift.
 */
export function pathFor(type: EntityType, id: string): string {
  const config = SEARCHABLE[type];
  return config ? `${config.path}/${id}` : '/';
}

const SNIPPET_RADIUS = 70;

type AnyDelegate = {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagsService,
  ) {}

  async search(userId: string, dto: SearchQueryDto) {
    const term = dto.q?.trim() ?? '';
    const types = (
      dto.types?.length ? dto.types : (Object.keys(SEARCHABLE) as EntityType[])
    ).filter((type) => SEARCHABLE[type]);

    if (!term && !dto.tags?.length) {
      return { term, total: 0, groups: [] };
    }

    const perType = Math.max(3, Math.floor((dto.limit ?? 40) / Math.max(1, types.length / 3)));
    const groups = await Promise.all(
      types.map((type) => this.searchOne(userId, type, term, dto, perType)),
    );

    const populated = groups
      .filter((group) => group.hits.length > 0)
      .sort((a, b) => b.hits[0].score - a.hits[0].score);

    return {
      term,
      total: populated.reduce((sum, group) => sum + group.hits.length, 0),
      groups: populated,
    };
  }

  private async searchOne(
    userId: string,
    type: EntityType,
    term: string,
    dto: SearchQueryDto,
    take: number,
  ): Promise<{ type: EntityType; hits: SearchHit[] }> {
    const config = SEARCHABLE[type] as Searchable;
    const stamp = config.stamp ?? 'updatedAt';

    const tagged = dto.tags?.length
      ? await this.tags.entityIdsWithTags(userId, type, dto.tags)
      : undefined;
    if (tagged?.length === 0) return { type, hits: [] };

    const scoped = config.scoped !== false;
    const where: Record<string, unknown> = {
      userId,
      // Filtering projects "by project" means filtering by the project itself.
      ...(dto.projectId ? (scoped ? { projectId: dto.projectId } : { id: dto.projectId }) : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...(dto.since ? { [stamp]: { gte: new Date(dto.since) } } : {}),
      ...(term
        ? {
            OR: config.fields.map((field) => ({
              [field]: { contains: term, mode: 'insensitive' },
            })),
          }
        : {}),
    };

    const delegate = this.prisma[config.delegate as keyof PrismaService] as unknown as AnyDelegate;
    const rows = await delegate.findMany({
      where,
      orderBy: { [stamp]: 'desc' },
      take,
      select: {
        id: true,
        ...(scoped ? { projectId: true } : {}),
        [stamp]: true,
        ...Object.fromEntries(config.fields.map((field) => [field, true])),
        ...(config.detail ? { [config.detail]: true } : {}),
        ...(type === 'PROJECT' ? { slug: true } : {}),
      },
    });

    const hits = rows.map((row) => {
      const title = String(row[config.fields[0]] ?? 'Untitled');
      const body = config.fields
        .slice(1)
        .map((field) => (typeof row[field] === 'string' ? (row[field] as string) : ''))
        .find((value) => value && matches(value, term));

      return {
        type,
        id: String(row.id),
        title,
        snippet: body ? excerpt(body, term) : undefined,
        detail: config.detail ? formatDetail(row[config.detail]) : undefined,
        href: `${config.path}/${type === 'PROJECT' ? String(row.slug ?? row.id) : String(row.id)}`,
        projectId: (row.projectId as string | null) ?? null,
        updatedAt: new Date(row[stamp] as string).toISOString(),
        score: rank(title, body, term, type),
      };
    });

    return { type, hits: hits.sort((a, b) => b.score - a.score) };
  }
}

function matches(value: string, term: string): boolean {
  return term.length > 0 && value.toLowerCase().includes(term.toLowerCase());
}

/** A window of text around the match, so a hit shows why it matched. */
function excerpt(value: string, term: string): string {
  const at = value.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return value.slice(0, SNIPPET_RADIUS * 2).trim();
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(value.length, at + term.length + SNIPPET_RADIUS);
  const text = value.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${text}${end < value.length ? '…' : ''}`;
}

/**
 * A title match outranks a body match, an exact word outranks a substring, and
 * a project outranks a bookmark when both match equally well.
 */
const TYPE_WEIGHT: Partial<Record<EntityType, number>> = {
  PROJECT: 12,
  SOLUTION: 10,
  NOTE: 8,
  TASK: 7,
  SERVER: 6,
  DATABASE: 6,
  ISSUE: 6,
  COMMAND: 5,
  SNIPPET: 5,
};

function rank(title: string, body: string | undefined, term: string, type: EntityType): number {
  if (!term) return TYPE_WEIGHT[type] ?? 3;
  const lowered = title.toLowerCase();
  const needle = term.toLowerCase();

  let score = TYPE_WEIGHT[type] ?? 3;
  if (lowered === needle) score += 100;
  else if (lowered.startsWith(needle)) score += 60;
  else if (new RegExp(`\\b${escapeRegExp(needle)}`).test(lowered)) score += 40;
  else if (lowered.includes(needle)) score += 20;
  else if (body) score += 8;
  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDetail(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
