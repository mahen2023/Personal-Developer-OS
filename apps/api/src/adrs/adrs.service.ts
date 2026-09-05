import { Injectable } from '@nestjs/common';
import { AdrStatus, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { AdrQueryDto, CreateAdrDto, SupersedeAdrDto, UpdateAdrDto } from './adrs.dto';

const SORTABLE = ['number', 'updatedAt', 'createdAt', 'title', 'status'] as const;

/**
 * Architecture decision records (§27).
 *
 * Numbers are assigned per user and never reused, because an ADR number is a
 * permanent citation — "see ADR-004" has to keep meaning the same thing after
 * ADR-004 is superseded or the project it belonged to is deleted.
 */
@Injectable()
export class AdrsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
  ) {}

  async list(userId: string, dto: AdrQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.ADR, dto.tags ?? []);
    const where: Prisma.AdrWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.status?.length ? { status: { in: dto.status } } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['title', 'context', 'decision', 'consequences', 'alternatives']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adr.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'number'),
        include: { project: PROJECT_REF },
      }),
      this.prisma.adr.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.ADR,
      rows.map((row) => row.id),
    );
    return page(
      rows.map((adr) => ({ ...adr, tags: tagMap.get(adr.id) ?? [] })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const adr = found(
      await this.prisma.adr.findFirst({ where: { id, userId }, include: { project: PROJECT_REF } }),
      'decision record',
    );

    // The supersession chain in both directions: what replaced this, and what
    // this replaced. A decision without its history is just an opinion.
    const [supersededBy, supersedes] = await Promise.all([
      adr.supersededBy
        ? this.prisma.adr.findFirst({
            where: { id: adr.supersededBy, userId },
            select: { id: true, number: true, title: true, status: true },
          })
        : null,
      this.prisma.adr.findMany({
        where: { userId, supersededBy: adr.id },
        select: { id: true, number: true, title: true, status: true },
      }),
    ]);

    return {
      ...adr,
      supersededByAdr: supersededBy,
      supersedes,
      tags: await this.tags.forEntity(userId, EntityType.ADR, id),
      links: await this.links.forEntity(userId, EntityType.ADR, id),
    };
  }

  async create(userId: string, dto: CreateAdrDto) {
    const adr = await this.prisma.adr.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        number: await this.nextNumber(userId),
        title: dto.title.trim(),
        status: dto.status,
        context: dto.context,
        decision: dto.decision,
        alternatives: dto.alternatives,
        consequences: dto.consequences,
        decidedAt: dto.status === AdrStatus.ACCEPTED ? new Date() : null,
      },
    });

    await this.tags.setFor(userId, EntityType.ADR, adr.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: adr.projectId,
      action: 'adr.created',
      entityType: EntityType.ADR,
      entityId: adr.id,
      summary: `Recorded ADR-${pad(adr.number)} — ${adr.title}`,
    });
    void this.indexer.touch(userId, 'adr', adr.id);
    return this.get(userId, adr.id);
  }

  async update(userId: string, id: string, dto: UpdateAdrDto) {
    const existing = found(
      await this.prisma.adr.findFirst({ where: { id, userId } }),
      'decision record',
    );

    const adr = await this.prisma.adr.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        status: dto.status,
        context: dto.context,
        decision: dto.decision,
        alternatives: dto.alternatives,
        consequences: dto.consequences,
        decidedAt:
          dto.status === AdrStatus.ACCEPTED && existing.status !== AdrStatus.ACCEPTED
            ? new Date()
            : undefined,
      },
    });

    await this.tags.setFor(userId, EntityType.ADR, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: adr.projectId,
      action: 'adr.updated',
      entityType: EntityType.ADR,
      entityId: id,
      summary: `Updated ADR-${pad(adr.number)} — ${adr.title}`,
    });
    void this.indexer.touch(userId, 'adr', id);
    return this.get(userId, id);
  }

  /**
   * Marks this record superseded by another. Both ends are updated together,
   * so the chain can be walked from either direction.
   */
  async supersede(userId: string, id: string, dto: SupersedeAdrDto) {
    const adr = found(
      await this.prisma.adr.findFirst({ where: { id, userId } }),
      'decision record',
    );
    const replacement = found(
      await this.prisma.adr.findFirst({ where: { id: dto.supersededBy, userId } }),
      'replacement decision record',
    );

    await this.prisma.adr.update({
      where: { id },
      data: { status: AdrStatus.SUPERSEDED, supersededBy: replacement.id },
    });

    await this.activity.record({
      userId,
      projectId: adr.projectId,
      action: 'adr.superseded',
      entityType: EntityType.ADR,
      entityId: id,
      summary: `ADR-${pad(adr.number)} superseded by ADR-${pad(replacement.number)}`,
    });
    void this.indexer.touch(userId, 'adr', id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const adr = found(
      await this.prisma.adr.findFirst({ where: { id, userId } }),
      'decision record',
    );

    await this.prisma.$transaction([
      // Clear the pointer on anything this record superseded, or those rows end
      // up citing a decision that no longer exists.
      this.prisma.adr.updateMany({
        where: { userId, supersededBy: id },
        data: { supersededBy: null },
      }),
      this.prisma.adr.delete({ where: { id } }),
    ]);

    await this.tags.detachAll(EntityType.ADR, id);
    await this.links.detachAll(EntityType.ADR, id);
    await this.activity.record({
      userId,
      projectId: adr.projectId,
      action: 'adr.deleted',
      entityType: EntityType.ADR,
      summary: `Deleted ADR-${pad(adr.number)} — ${adr.title}`,
    });
    await this.indexer.forget(EntityType.ADR, id);
  }

  /**
   * Takes the next number from the user's counter.
   *
   * A single atomic UPDATE, rather than max(number) + 1: deriving it from the
   * existing rows would hand out a freed number after a deletion, and would
   * race with itself under concurrent creates.
   */
  private async nextNumber(userId: string): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { adrSequence: { increment: 1 } },
      select: { adrSequence: true },
    });
    return user.adrSequence;
  }
}

export function pad(number: number): string {
  return String(number).padStart(3, '0');
}
