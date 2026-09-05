import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/slug';
import { cleanList } from '../common/query';

export interface TagRef {
  id: string;
  name: string;
  slug: string;
  color: string | null;
}

const MAX_TAGS_PER_ENTITY = 20;

/**
 * Tags are polymorphic: one `tags` row per name, and an `entity_tags` row per
 * (tag, entity type, entity id). That is what lets a tag span notes, servers
 * and solutions without a join table per pairing — and why the referential
 * integrity of `entityId` is this service's responsibility, not the database's.
 */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every tag the user has, with how many things carry it. */
  async list(userId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { entries: true } } },
    });
    return tags.map(({ _count, ...tag }) => ({ ...tag, count: _count.entries }));
  }

  /** Creates any tag that does not exist yet and returns the whole set. */
  async ensure(userId: string, names: string[]): Promise<TagRef[]> {
    const wanted = cleanList(names, MAX_TAGS_PER_ENTITY)
      .map((name) => ({ name, slug: slugify(name) }))
      .filter((tag) => tag.slug.length > 0);
    if (wanted.length === 0) return [];

    await this.prisma.tag.createMany({
      data: wanted.map((tag) => ({ userId, name: tag.name, slug: tag.slug })),
      skipDuplicates: true,
    });

    return this.prisma.tag.findMany({
      where: { userId, slug: { in: wanted.map((tag) => tag.slug) } },
      select: { id: true, name: true, slug: true, color: true },
    });
  }

  /** Replaces an entity's tags wholesale — the shape every edit form sends. */
  async setFor(
    userId: string,
    entityType: EntityType,
    entityId: string,
    names: string[] | undefined,
  ): Promise<TagRef[]> {
    if (names === undefined) return this.forEntity(userId, entityType, entityId);

    const tags = await this.ensure(userId, names);
    await this.prisma.$transaction([
      this.prisma.entityTag.deleteMany({ where: { entityType, entityId, tag: { userId } } }),
      this.prisma.entityTag.createMany({
        data: tags.map((tag) => ({ tagId: tag.id, entityType, entityId })),
        skipDuplicates: true,
      }),
    ]);
    return tags;
  }

  async forEntity(userId: string, entityType: EntityType, entityId: string): Promise<TagRef[]> {
    const entries = await this.prisma.entityTag.findMany({
      where: { entityType, entityId, tag: { userId } },
      include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
    });
    return entries.map((entry) => entry.tag);
  }

  /**
   * Tags for a whole page of rows in one query. Calling forEntity() per row is
   * the obvious version and turns a 25-row list into 26 round trips.
   */
  async forEntities(
    userId: string,
    entityType: EntityType,
    entityIds: string[],
  ): Promise<Map<string, TagRef[]>> {
    const grouped = new Map<string, TagRef[]>();
    if (entityIds.length === 0) return grouped;

    const entries = await this.prisma.entityTag.findMany({
      where: { entityType, entityId: { in: entityIds }, tag: { userId } },
      include: { tag: { select: { id: true, name: true, slug: true, color: true } } },
    });

    for (const entry of entries) {
      const list = grouped.get(entry.entityId) ?? [];
      list.push(entry.tag);
      grouped.set(entry.entityId, list);
    }
    return grouped;
  }

  /** Ids of everything of one type carrying every one of these tag slugs. */
  async entityIdsWithTags(
    userId: string,
    entityType: EntityType,
    slugs: string[],
  ): Promise<string[] | undefined> {
    const wanted = cleanList(slugs).map(slugify).filter(Boolean);
    if (wanted.length === 0) return undefined;

    const entries = await this.prisma.entityTag.findMany({
      where: { entityType, tag: { userId, slug: { in: wanted } } },
      select: { entityId: true, tagId: true },
    });

    // AND semantics: an entity must carry all of the requested tags.
    const hits = new Map<string, Set<string>>();
    for (const entry of entries) {
      const set = hits.get(entry.entityId) ?? new Set<string>();
      set.add(entry.tagId);
      hits.set(entry.entityId, set);
    }
    return [...hits.entries()]
      .filter(([, set]) => set.size === wanted.length)
      .map(([entityId]) => entityId);
  }

  async rename(userId: string, id: string, name: string, color?: string) {
    return this.prisma.tag.update({
      where: { id, userId },
      data: { name: name.trim(), slug: slugify(name), color },
    });
  }

  /** Deleting a tag cascades to its entity_tags rows; nothing else is touched. */
  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.tag.deleteMany({ where: { id, userId } });
  }

  /** Called when an entity is deleted, so tag links do not outlive their row. */
  async detachAll(entityType: EntityType, entityId: string): Promise<void> {
    await this.prisma.entityTag.deleteMany({ where: { entityType, entityId } });
  }
}
