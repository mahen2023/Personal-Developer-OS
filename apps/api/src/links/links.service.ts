import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EntityRef {
  type: EntityType;
  id: string;
  label: string;
  detail?: string;
  href: string;
}

/**
 * Which Prisma model backs each EntityType, which column reads as its name, and
 * where the UI finds it. This table is the price of polymorphic linking, and it
 * is the one place to update when an entity type is added.
 */
const RESOLVERS: Record<
  EntityType,
  { model: Prisma.ModelName; title: string; subtitle?: string; path: string }
> = {
  PROJECT: { model: 'Project', title: 'name', subtitle: 'status', path: '/projects' },
  REPOSITORY: { model: 'Repository', title: 'name', subtitle: 'provider', path: '/repositories' },
  ENVIRONMENT: { model: 'Environment', title: 'name', subtitle: 'type', path: '/environments' },
  SERVER: { model: 'Server', title: 'name', subtitle: 'ipAddress', path: '/servers' },
  DATABASE: { model: 'DatabaseInstance', title: 'name', subtitle: 'type', path: '/databases' },
  DOMAIN: { model: 'Domain', title: 'name', subtitle: 'registrar', path: '/domains' },
  SSL_CERTIFICATE: {
    model: 'SslCertificate',
    title: 'commonName',
    subtitle: 'issuer',
    path: '/certificates',
  },
  DEPLOYMENT: { model: 'Deployment', title: 'version', subtitle: 'status', path: '/deployments' },
  NOTE: { model: 'Note', title: 'title', subtitle: 'type', path: '/notes' },
  TASK: { model: 'Task', title: 'title', subtitle: 'status', path: '/tasks' },
  ISSUE: { model: 'Issue', title: 'title', subtitle: 'status', path: '/issues' },
  SOLUTION: { model: 'Solution', title: 'title', subtitle: 'environment', path: '/solutions' },
  SNIPPET: { model: 'Snippet', title: 'title', subtitle: 'language', path: '/snippets' },
  COMMAND: { model: 'Command', title: 'title', subtitle: 'category', path: '/commands' },
  ADR: { model: 'Adr', title: 'title', subtitle: 'status', path: '/adrs' },
  MEETING: { model: 'Meeting', title: 'title', path: '/meetings' },
  DOCUMENT: { model: 'Document', title: 'originalName', subtitle: 'mimeType', path: '/documents' },
  BOOKMARK: { model: 'Bookmark', title: 'title', subtitle: 'category', path: '/bookmarks' },
  LEARNING: { model: 'LearningItem', title: 'title', subtitle: 'status', path: '/learning' },
  IDEA: { model: 'Idea', title: 'title', subtitle: 'status', path: '/ideas' },
  VAULT_ITEM: { model: 'VaultItem', title: 'name', subtitle: 'type', path: '/vault' },
};

/** Lowercases the Prisma model name to its delegate key: Project -> project. */
function delegateKey(model: Prisma.ModelName): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type AnyDelegate = {
  findMany(args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }): Promise<Record<string, unknown>[]>;
};

/**
 * Free-form links between any two entities (§50). Structural relationships are
 * real foreign keys; this covers the ones a schema cannot anticipate, such as
 * "this note explains that deployment".
 */
@Injectable()
export class LinksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the display data for a set of references. The `userId` filter is what
   * stops a forged link id from resolving to somebody else's row — polymorphic
   * ids get no protection from the database, so it has to happen here.
   */
  async resolve(userId: string, refs: { type: EntityType; id: string }[]): Promise<EntityRef[]> {
    const byType = new Map<EntityType, string[]>();
    for (const ref of refs) {
      byType.set(ref.type, [...(byType.get(ref.type) ?? []), ref.id]);
    }

    const resolved: EntityRef[] = [];
    for (const [type, ids] of byType) {
      const config = RESOLVERS[type];
      const delegate = this.prisma[delegateKey(config.model) as keyof PrismaService];
      const rows = await (delegate as unknown as AnyDelegate).findMany({
        where: { id: { in: ids }, userId },
        select: {
          id: true,
          [config.title]: true,
          ...(config.subtitle ? { [config.subtitle]: true } : {}),
          ...(type === 'PROJECT' ? { slug: true } : {}),
        },
      });

      for (const row of rows) {
        const id = String(row.id);
        resolved.push({
          type,
          id,
          label: String(row[config.title] ?? 'Untitled'),
          detail: config.subtitle ? formatDetail(row[config.subtitle]) : undefined,
          // Projects are addressed by slug; everything else by id.
          href: `${config.path}/${type === 'PROJECT' ? String(row.slug ?? id) : id}`,
        });
      }
    }
    return resolved;
  }

  /** Both directions at once — a link is a relationship, not an arrow. */
  async forEntity(userId: string, type: EntityType, id: string): Promise<EntityRef[]> {
    const links = await this.prisma.entityLink.findMany({
      where: {
        userId,
        OR: [
          { fromType: type, fromId: id },
          { toType: type, toId: id },
        ],
      },
    });

    const refs = links.map((link) =>
      link.fromType === type && link.fromId === id
        ? { type: link.toType, id: link.toId }
        : { type: link.fromType, id: link.fromId },
    );
    return this.resolve(userId, refs);
  }

  async link(
    userId: string,
    from: { type: EntityType; id: string },
    to: { type: EntityType; id: string },
    label?: string,
  ): Promise<void> {
    if (from.type === to.type && from.id === to.id) {
      throw new BadRequestException('An item cannot be linked to itself.');
    }
    // Resolving both ends proves the caller owns them before anything is stored.
    const ends = await this.resolve(userId, [from, to]);
    if (ends.length !== 2) {
      throw new BadRequestException('One of those items does not exist, or is not yours.');
    }

    await this.prisma.entityLink.upsert({
      where: {
        fromType_fromId_toType_toId: {
          fromType: from.type,
          fromId: from.id,
          toType: to.type,
          toId: to.id,
        },
      },
      create: { userId, fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, label },
      update: { label },
    });
  }

  async unlink(
    userId: string,
    from: { type: EntityType; id: string },
    to: { type: EntityType; id: string },
  ): Promise<void> {
    await this.prisma.entityLink.deleteMany({
      where: {
        userId,
        OR: [
          { fromType: from.type, fromId: from.id, toType: to.type, toId: to.id },
          { fromType: to.type, fromId: to.id, toType: from.type, toId: from.id },
        ],
      },
    });
  }

  /** Called when an entity is deleted, so no link points at a missing row. */
  async detachAll(type: EntityType, id: string): Promise<void> {
    await this.prisma.entityLink.deleteMany({
      where: {
        OR: [
          { fromType: type, fromId: id },
          { toType: type, toId: id },
        ],
      },
    });
  }
}

function formatDetail(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
