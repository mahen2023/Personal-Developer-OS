import { Injectable } from '@nestjs/common';
import { EntityType, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, cleanList, found, pageArgs, scopeToProject, search } from '../common/query';
import {
  ActionItemsDto,
  CreateMeetingDto,
  MeetingQueryDto,
  UpdateMeetingDto,
} from './meetings.dto';

const SORTABLE = ['meetingDate', 'createdAt', 'updatedAt', 'title'] as const;

const ACTION_ITEMS = {
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    title: true,
    status: true,
    priority: true,
    dueDate: true,
    completedAt: true,
    projectId: true,
  },
} as const;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
  ) {}

  async list(userId: string, dto: MeetingQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.MEETING, dto.tags ?? []);
    const where: Prisma.MeetingWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...(dto.since ? { meetingDate: { gte: new Date(dto.since) } } : {}),
      ...search(dto.q, ['title', 'discussion', 'decisions']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.meeting.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'meetingDate'),
        include: { project: PROJECT_REF, _count: { select: { actionItems: true } } },
      }),
      this.prisma.meeting.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.MEETING,
      rows.map((row) => row.id),
    );
    return page(
      rows.map(({ _count, ...meeting }) => ({
        ...meeting,
        actionItemCount: _count.actionItems,
        tags: tagMap.get(meeting.id) ?? [],
      })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const meeting = found(
      await this.prisma.meeting.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF, actionItems: ACTION_ITEMS },
      }),
      'meeting',
    );
    return {
      ...meeting,
      tags: await this.tags.forEntity(userId, EntityType.MEETING, id),
      links: await this.links.forEntity(userId, EntityType.MEETING, id),
    };
  }

  async create(userId: string, dto: CreateMeetingDto) {
    const meeting = await this.prisma.meeting.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        meetingDate: new Date(dto.meetingDate),
        participants: cleanList(dto.participants),
        discussion: dto.discussion,
        decisions: dto.decisions,
      },
    });

    await this.tags.setFor(userId, EntityType.MEETING, meeting.id, dto.tags);
    if (dto.actionItems?.length) {
      await this.addActionItems(userId, meeting.id, { titles: dto.actionItems });
    }

    await this.activity.record({
      userId,
      projectId: meeting.projectId,
      action: 'meeting.created',
      entityType: EntityType.MEETING,
      entityId: meeting.id,
      summary: `Recorded meeting ${meeting.title}`,
    });
    void this.indexer.touch(userId, 'meeting', meeting.id);
    return this.get(userId, meeting.id);
  }

  async update(userId: string, id: string, dto: UpdateMeetingDto) {
    found(
      await this.prisma.meeting.findFirst({ where: { id, userId }, select: { id: true } }),
      'meeting',
    );

    const meeting = await this.prisma.meeting.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined,
        participants: dto.participants ? cleanList(dto.participants) : undefined,
        discussion: dto.discussion,
        decisions: dto.decisions,
      },
    });

    await this.tags.setFor(userId, EntityType.MEETING, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: meeting.projectId,
      action: 'meeting.updated',
      entityType: EntityType.MEETING,
      entityId: id,
      summary: `Updated meeting ${meeting.title}`,
    });
    void this.indexer.touch(userId, 'meeting', id);
    return this.get(userId, id);
  }

  /**
   * Promotes action items into real tasks (§28).
   *
   * They become ordinary tasks — they show up in the board, the timeline and
   * the overdue count like anything else — and keep a link back to the meeting
   * they came from. An action item that lives only in meeting notes is one
   * nobody ever does.
   */
  async addActionItems(userId: string, id: string, dto: ActionItemsDto) {
    const meeting = found(
      await this.prisma.meeting.findFirst({ where: { id, userId } }),
      'meeting',
    );
    const titles = cleanList(dto.titles, 50);
    if (titles.length === 0) return this.get(userId, id);

    await this.prisma.task.createMany({
      data: titles.map((title) => ({
        userId,
        projectId: meeting.projectId,
        meetingId: meeting.id,
        title,
        status: TaskStatus.TODO,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignee: dto.assignee,
      })),
    });

    await this.activity.record({
      userId,
      projectId: meeting.projectId,
      action: 'meeting.action_items',
      entityType: EntityType.MEETING,
      entityId: id,
      summary: `Created ${titles.length} task${titles.length === 1 ? '' : 's'} from ${meeting.title}`,
    });
    void this.indexer.touch(userId, 'meeting', id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const meeting = found(
      await this.prisma.meeting.findFirst({ where: { id, userId } }),
      'meeting',
    );

    // Tasks survive; `meetingId` is SetNull. Deleting notes of a meeting must
    // not delete the work that came out of it.
    await this.prisma.meeting.delete({ where: { id } });
    await this.tags.detachAll(EntityType.MEETING, id);
    await this.links.detachAll(EntityType.MEETING, id);

    await this.activity.record({
      userId,
      projectId: meeting.projectId,
      action: 'meeting.deleted',
      entityType: EntityType.MEETING,
      summary: `Deleted meeting ${meeting.title} — its action items were kept`,
    });
    await this.indexer.forget(EntityType.MEETING, id);
  }
}
