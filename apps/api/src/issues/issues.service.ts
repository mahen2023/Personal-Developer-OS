import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType, IssueStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { SolutionsService } from '../solutions/solutions.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { CreateIssueDto, IssueQueryDto, ResolveIssueDto, UpdateIssueDto } from './issues.dto';

const SORTABLE = ['updatedAt', 'createdAt', 'title', 'status', 'priority'] as const;
const OPEN: IssueStatus[] = [IssueStatus.OPEN, IssueStatus.INVESTIGATING, IssueStatus.BLOCKED];

const SOLUTION_REF = { select: { id: true, title: true, useCount: true } } as const;

/**
 * Issues are the "something is broken" side of the knowledge base; solutions
 * are the "here is how it was fixed" side. Resolving an issue is what joins
 * them, and it is the moment worth making easy — that is when the fix is
 * still fresh enough to write down accurately.
 */
@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
    private readonly solutions: SolutionsService,
  ) {}

  async list(userId: string, dto: IssueQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.ISSUE, dto.tags ?? []);
    const where: Prisma.IssueWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.status?.length ? { status: { in: dto.status } } : {}),
      ...(dto.open ? { status: { in: OPEN } } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['title', 'description', 'errorMessage']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.issue.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'updatedAt'),
        include: { project: PROJECT_REF, solution: SOLUTION_REF },
      }),
      this.prisma.issue.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.ISSUE,
      rows.map((row) => row.id),
    );
    return page(
      rows.map((issue) => ({ ...issue, tags: tagMap.get(issue.id) ?? [] })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const issue = found(
      await this.prisma.issue.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF, solution: SOLUTION_REF },
      }),
      'issue',
    );

    return {
      ...issue,
      tags: await this.tags.forEntity(userId, EntityType.ISSUE, id),
      links: await this.links.forEntity(userId, EntityType.ISSUE, id),
      // "Have I seen this before?" — shown while the issue is still open, when
      // it is actually useful.
      suggestions: issue.solutionId
        ? []
        : await this.solutions.similar(
            userId,
            `${issue.title} ${issue.description ?? ''} ${issue.errorMessage ?? ''}`,
          ),
    };
  }

  async create(userId: string, dto: CreateIssueDto) {
    const issue = await this.prisma.issue.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        description: dto.description,
        errorMessage: dto.errorMessage,
        status: dto.status,
        priority: dto.priority,
      },
    });

    await this.tags.setFor(userId, EntityType.ISSUE, issue.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: issue.projectId,
      action: 'issue.created',
      entityType: EntityType.ISSUE,
      entityId: issue.id,
      summary: `Opened issue ${issue.title}`,
    });
    void this.indexer.touch(userId, 'issue', issue.id);
    return this.get(userId, issue.id);
  }

  async update(userId: string, id: string, dto: UpdateIssueDto) {
    const existing = found(await this.prisma.issue.findFirst({ where: { id, userId } }), 'issue');

    const issue = await this.prisma.issue.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        description: dto.description,
        errorMessage: dto.errorMessage,
        status: dto.status,
        priority: dto.priority,
        // Like task completion, this is derived from status rather than sent.
        resolvedAt: resolutionStamp(existing.status, dto.status, existing.resolvedAt),
      },
    });

    await this.tags.setFor(userId, EntityType.ISSUE, id, dto.tags);
    if (dto.status && dto.status !== existing.status) {
      await this.activity.record({
        userId,
        projectId: issue.projectId,
        action: 'issue.status_changed',
        entityType: EntityType.ISSUE,
        entityId: id,
        summary: `Moved issue ${issue.title} to ${dto.status.toLowerCase()}`,
      });
      void this.indexer.touch(userId, 'issue', id);
    }
    return this.get(userId, id);
  }

  /**
   * Closes an issue against a solution — either an existing one, or a new one
   * written from the fix. Doing both in one call is what stops the write-up
   * from being "later", which always means never.
   */
  async resolve(userId: string, id: string, dto: ResolveIssueDto) {
    const issue = found(await this.prisma.issue.findFirst({ where: { id, userId } }), 'issue');

    let solutionId = dto.solutionId;

    if (dto.solution) {
      const created = await this.solutions.create(userId, {
        title: dto.solution.title ?? issue.title,
        problem: dto.solution.problem ?? issue.description ?? issue.title,
        errorMessage: dto.solution.errorMessage ?? issue.errorMessage ?? undefined,
        environment: dto.solution.environment,
        rootCause: dto.solution.rootCause,
        solution: dto.solution.solution,
        commands: dto.solution.commands,
        projectId: issue.projectId,
        tags: dto.solution.tags,
      });
      solutionId = created.id;
    } else if (solutionId) {
      // A solution id from the client is untrusted until it resolves to a row
      // this user owns.
      found(
        await this.prisma.solution.findFirst({
          where: { id: solutionId, userId },
          select: { id: true },
        }),
        'solution',
      );
      await this.prisma.solution.update({
        where: { id: solutionId },
        data: { useCount: { increment: 1 } },
      });
    } else {
      throw new BadRequestException(
        'Link an existing solution or write a new one — an issue should not close without a record of the fix.',
      );
    }

    await this.prisma.issue.update({
      where: { id },
      data: { status: IssueStatus.RESOLVED, solutionId, resolvedAt: new Date() },
    });

    await this.activity.record({
      userId,
      projectId: issue.projectId,
      action: 'issue.resolved',
      entityType: EntityType.ISSUE,
      entityId: id,
      summary: `Resolved ${issue.title}`,
    });
    void this.indexer.touch(userId, 'issue', id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const issue = found(await this.prisma.issue.findFirst({ where: { id, userId } }), 'issue');
    await this.prisma.issue.delete({ where: { id } });
    await this.tags.detachAll(EntityType.ISSUE, id);
    await this.links.detachAll(EntityType.ISSUE, id);
    await this.activity.record({
      userId,
      projectId: issue.projectId,
      action: 'issue.deleted',
      entityType: EntityType.ISSUE,
      summary: `Deleted issue ${issue.title}`,
    });
    await this.indexer.forget(EntityType.ISSUE, id);
  }
}

function resolutionStamp(
  from: IssueStatus,
  to: IssueStatus | undefined,
  current: Date | null,
): Date | null | undefined {
  if (!to || to === from) return undefined;
  if (to === IssueStatus.RESOLVED || to === IssueStatus.CLOSED) return new Date();
  return current ? null : undefined;
}
