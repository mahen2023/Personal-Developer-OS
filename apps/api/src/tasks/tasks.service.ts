import { Injectable } from '@nestjs/common';
import { EntityType, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { CreateTaskDto, MoveTaskDto, TaskQueryDto, UpdateTaskDto } from './tasks.dto';

const SORTABLE = ['dueDate', 'createdAt', 'updatedAt', 'priority', 'title', 'orderKey'] as const;
const OPEN: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];
export const BOARD_COLUMNS: TaskStatus[] = [...OPEN, TaskStatus.DONE];

/** Gap between order keys, so a card can be dropped between two without a re-index. */
const ORDER_GAP = 1000;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
  ) {}

  async list(userId: string, dto: TaskQueryDto) {
    const where = await this.where(userId, dto);
    const { skip, take } = pageArgs(dto, SORTABLE, 'dueDate');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: this.order(dto),
        skip,
        take,
        include: { project: PROJECT_REF },
      }),
      this.prisma.task.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.TASK,
      rows.map((row) => row.id),
    );
    return page(
      rows.map((task) => ({ ...task, tags: tagMap.get(task.id) ?? [] })),
      total,
      dto,
    );
  }

  /**
   * The kanban view (§13). Returns every open column plus a capped Done column —
   * a board that loads two years of finished work is unusable, and the list view
   * is the right place to go looking for old ones.
   */
  async board(userId: string, dto: TaskQueryDto) {
    const where = await this.where(userId, { ...dto, status: undefined } as TaskQueryDto);

    const columns = await Promise.all(
      BOARD_COLUMNS.map(async (status) => {
        const columnWhere = { ...where, status };
        const [items, total] = await this.prisma.$transaction([
          this.prisma.task.findMany({
            where: columnWhere,
            orderBy:
              status === TaskStatus.DONE
                ? [{ completedAt: 'desc' }]
                : [{ orderKey: 'asc' }, { createdAt: 'asc' }],
            take: status === TaskStatus.DONE ? 25 : 200,
            include: { project: PROJECT_REF },
          }),
          this.prisma.task.count({ where: columnWhere }),
        ]);
        return { status, items, total };
      }),
    );

    return { columns };
  }

  /** Open tasks with a due date, for the timeline view. */
  async timeline(userId: string, dto: TaskQueryDto) {
    const where = {
      ...(await this.where(userId, dto)),
      dueDate: { not: null },
    } satisfies Prisma.TaskWhereInput;

    const items = await this.prisma.task.findMany({
      where,
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      take: 300,
      include: { project: PROJECT_REF },
    });

    // Grouped by day here rather than in the browser, so every view of the same
    // data agrees on what "overdue" and "today" mean — the server's clock wins.
    const groups = new Map<string, typeof items>();
    for (const task of items) {
      const key = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : 'unscheduled';
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    return { days: [...groups.entries()].map(([date, tasks]) => ({ date, tasks })) };
  }

  async get(userId: string, id: string) {
    const task = found(
      await this.prisma.task.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF, meeting: { select: { id: true, title: true } } },
      }),
      'task',
    );
    return {
      ...task,
      tags: await this.tags.forEntity(userId, EntityType.TASK, id),
      links: await this.links.forEntity(userId, EntityType.TASK, id),
    };
  }

  async create(userId: string, dto: CreateTaskDto) {
    const task = await this.prisma.task.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        description: dto.description,
        status: dto.status ?? TaskStatus.TODO,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignee: dto.assignee,
        meetingId: dto.meetingId ?? null,
        orderKey: await this.nextOrderKey(userId, dto.status ?? TaskStatus.TODO),
        completedAt: dto.status === TaskStatus.DONE ? new Date() : null,
      },
    });

    await this.tags.setFor(userId, EntityType.TASK, task.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: task.projectId,
      action: 'task.created',
      entityType: EntityType.TASK,
      entityId: task.id,
      summary: `Created task ${task.title}`,
    });
    return this.get(userId, task.id);
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const existing = found(await this.prisma.task.findFirst({ where: { id, userId } }), 'task');

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        assignee: dto.assignee,
        // completedAt is derived from status, never sent by the client, so the
        // two can never disagree.
        completedAt: completionStamp(existing.status, dto.status, existing.completedAt),
      },
    });

    await this.tags.setFor(userId, EntityType.TASK, id, dto.tags);
    if (dto.status && dto.status !== existing.status) {
      await this.activity.record({
        userId,
        projectId: task.projectId,
        action: dto.status === TaskStatus.DONE ? 'task.completed' : 'task.moved',
        entityType: EntityType.TASK,
        entityId: id,
        summary:
          dto.status === TaskStatus.DONE
            ? `Completed ${task.title}`
            : `Moved ${task.title} to ${label(dto.status)}`,
      });
    }
    return this.get(userId, id);
  }

  /** Drag and drop on the board: a new column and a position within it. */
  async move(userId: string, id: string, dto: MoveTaskDto) {
    const existing = found(await this.prisma.task.findFirst({ where: { id, userId } }), 'task');

    let orderKey = await this.keyForPosition(userId, id, dto.status, dto.position);
    if (orderKey === null) {
      // The gap between two neighbours closed after enough halving. Re-spread
      // the column once and the next attempt always finds room.
      await this.respread(userId, dto.status);
      orderKey = await this.keyForPosition(userId, id, dto.status, dto.position);
    }

    await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        orderKey: orderKey ?? ORDER_GAP,
        completedAt: completionStamp(existing.status, dto.status, existing.completedAt),
      },
    });

    if (existing.status !== dto.status) {
      await this.activity.record({
        userId,
        projectId: existing.projectId,
        action: dto.status === TaskStatus.DONE ? 'task.completed' : 'task.moved',
        entityType: EntityType.TASK,
        entityId: id,
        summary:
          dto.status === TaskStatus.DONE
            ? `Completed ${existing.title}`
            : `Moved ${existing.title} to ${label(dto.status)}`,
      });
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const task = found(await this.prisma.task.findFirst({ where: { id, userId } }), 'task');
    await this.prisma.task.delete({ where: { id } });
    await this.tags.detachAll(EntityType.TASK, id);
    await this.links.detachAll(EntityType.TASK, id);
    await this.activity.record({
      userId,
      projectId: task.projectId,
      action: 'task.deleted',
      entityType: EntityType.TASK,
      summary: `Deleted task ${task.title}`,
    });
  }

  /**
   * A task list answers "what is due soonest", so it sorts ascending with
   * undated work last — the opposite of the newest-first default every other
   * module wants. An explicit ?sort= still wins.
   */
  private order(dto: TaskQueryDto): Prisma.TaskOrderByWithRelationInput {
    const column =
      dto.sort && SORTABLE.includes(dto.sort as (typeof SORTABLE)[number]) ? dto.sort : 'dueDate';
    const direction = dto.sort ? dto.order : 'asc';
    return column === 'dueDate'
      ? { dueDate: { sort: direction, nulls: 'last' } }
      : { [column]: direction };
  }

  private async where(userId: string, dto: TaskQueryDto): Promise<Prisma.TaskWhereInput> {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.TASK, dto.tags ?? []);
    return {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.status?.length ? { status: { in: dto.status } } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.open ? { status: { in: OPEN } } : {}),
      ...(dto.overdue ? { dueDate: { lt: new Date() }, status: { in: OPEN } } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['title', 'description', 'assignee']),
    };
  }

  /** null means the neighbours are adjacent and the column needs re-spreading. */
  private async keyForPosition(
    userId: string,
    id: string,
    status: TaskStatus,
    position: number,
  ): Promise<number | null> {
    const neighbours = await this.prisma.task.findMany({
      where: { userId, status, NOT: { id } },
      orderBy: { orderKey: 'asc' },
      select: { orderKey: true },
    });

    const index = Math.max(0, Math.min(position, neighbours.length));
    const before = index > 0 ? neighbours[index - 1].orderKey : null;
    const after = index < neighbours.length ? neighbours[index].orderKey : null;

    if (before === null && after === null) return ORDER_GAP;
    if (before === null) return after! - ORDER_GAP;
    if (after === null) return before + ORDER_GAP;

    const midpoint = Math.round((before + after) / 2);
    return midpoint === before || midpoint === after ? null : midpoint;
  }

  private async nextOrderKey(userId: string, status: TaskStatus): Promise<number> {
    const last = await this.prisma.task.findFirst({
      where: { userId, status },
      orderBy: { orderKey: 'desc' },
      select: { orderKey: true },
    });
    return (last?.orderKey ?? 0) + ORDER_GAP;
  }

  private async respread(userId: string, status: TaskStatus): Promise<void> {
    const rows = await this.prisma.task.findMany({
      where: { userId, status },
      orderBy: { orderKey: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      rows.map((row, index) =>
        this.prisma.task.update({
          where: { id: row.id },
          data: { orderKey: (index + 1) * ORDER_GAP },
        }),
      ),
    );
  }
}

function completionStamp(
  from: TaskStatus,
  to: TaskStatus | undefined,
  current: Date | null,
): Date | null | undefined {
  if (!to || to === from) return undefined;
  if (to === TaskStatus.DONE) return new Date();
  // Reopening a finished task clears the stamp, so "completed this week" counts
  // stay honest.
  return current ? null : undefined;
}

function label(status: TaskStatus): string {
  return status.toLowerCase().replace('_', ' ');
}
