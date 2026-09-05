import { Injectable } from '@nestjs/common';
import { AiMode, AiRole, EntityType, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../activity/activity.service';
import { PROJECT_REF, found, pageArgs, scopeToProject } from '../../common/query';
import { page } from '../../common/dto/pagination.dto';
import { MODES } from '../chat/modes';
import type {
  ConversationQueryDto,
  CreateConversationDto,
  MessagePageDto,
  UpdateConversationDto,
} from '../dto/chat.dto';

const SORTABLE = ['updatedAt', 'createdAt', 'title'] as const;

/**
 * Conversations (§9, §11).
 *
 * Not a `CrudService` subclass: a conversation is never indexed, its list is
 * filtered by pinned/archived rather than by tag, and its search reaches into
 * message bodies. Three exceptions out of a base class of four is a sign it is
 * the wrong base class.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(userId: string, dto: ConversationQueryDto) {
    const where: Prisma.AiConversationWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...filterOf(dto.filter),
      ...(dto.q?.trim()
        ? {
            // Title first, then message bodies — searching a chat archive for a
            // term you remember saying is the point of the feature (§51).
            OR: [
              { title: { contains: dto.q.trim(), mode: 'insensitive' } },
              { messages: { some: { content: { contains: dto.q.trim(), mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.aiConversation.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'updatedAt'),
        include: {
          project: PROJECT_REF,
          _count: { select: { messages: true } },
          // The last turn, for the one-line preview in the rail.
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { role: true, content: true, createdAt: true },
          },
        },
      }),
      this.prisma.aiConversation.count({ where }),
    ]);

    return page(rows.map(toListRow), total, dto);
  }

  async get(userId: string, id: string) {
    const conversation = found(
      await this.prisma.aiConversation.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF, _count: { select: { messages: true } } },
      }),
      'conversation',
    );
    return conversation;
  }

  /**
   * A page of messages, newest last.
   *
   * Paged from the end backwards because that is how a transcript is read: the
   * first request wants the tail, and `before` walks into the history (§58).
   */
  async messages(userId: string, id: string, dto: MessagePageDto) {
    await this.get(userId, id);
    const limit = dto.limit ?? 50;

    const cursor = dto.before
      ? await this.prisma.aiMessage.findFirst({
          where: { id: dto.before, conversationId: id },
          select: { createdAt: true },
        })
      : null;

    const rows = await this.prisma.aiMessage.findMany({
      where: {
        conversationId: id,
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    return { items: rows.slice(0, limit).reverse(), hasMore };
  }

  async create(userId: string, dto: CreateConversationDto, fallbackModel: string) {
    const mode = dto.mode ?? AiMode.GENERAL;
    const conversation = await this.prisma.aiConversation.create({
      data: {
        userId,
        title: dto.title?.trim() || 'New conversation',
        model: dto.model?.trim() || fallbackModel,
        mode,
        projectId: dto.projectId ?? null,
        // Not empty by default: a conversation with no sources silently answers
        // from the model alone, which is the opposite of what this is for.
        sources: (dto.sources ?? MODES[mode].defaultSources).map(String),
        attached: dto.attached ?? [],
      },
      include: { project: PROJECT_REF, _count: { select: { messages: true } } },
    });

    await this.activity.record({
      userId,
      projectId: conversation.projectId,
      action: 'ai.conversation.started',
      entityType: EntityType.NOTE,
      entityId: conversation.id,
      summary: `Started "${conversation.title}" with ${conversation.model}`,
    });
    return conversation;
  }

  async update(userId: string, id: string, dto: UpdateConversationDto) {
    const existing = await this.get(userId, id);

    const conversation = await this.prisma.aiConversation.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        model: dto.model?.trim(),
        mode: dto.mode,
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        sources: dto.sources?.map(String),
        attached: dto.attached,
        isPinned: dto.isPinned,
        isArchived: dto.isArchived,
      },
      include: { project: PROJECT_REF, _count: { select: { messages: true } } },
    });

    // A model change is part of the transcript, not a silent settings edit —
    // §54 wants the marker in the thread rather than a confirmation dialog.
    if (dto.model && dto.model !== existing.model && existing.model) {
      await this.prisma.aiMessage.create({
        data: {
          conversationId: id,
          role: AiRole.SYSTEM,
          content: `Model switched from ${existing.model} to ${dto.model}`,
          model: dto.model,
        },
      });
    }
    return conversation;
  }

  async remove(userId: string, id: string): Promise<void> {
    const conversation = await this.get(userId, id);
    // Messages and usage rows cascade — the transcript is the conversation,
    // and keeping half of it would be a record of nothing.
    await this.prisma.aiConversation.delete({ where: { id } });
    await this.activity.record({
      userId,
      projectId: conversation.projectId,
      action: 'ai.conversation.deleted',
      entityType: EntityType.NOTE,
      summary: `Deleted conversation "${conversation.title}"`,
    });
  }
}

function filterOf(filter: string | undefined): Prisma.AiConversationWhereInput {
  if (filter === 'pinned') return { isPinned: true, isArchived: false };
  if (filter === 'archived') return { isArchived: true };
  if (filter === 'all') return {};
  // Archived conversations are out of the way by default, which is what
  // archiving is for. `all` is how you get them back.
  return { isArchived: false };
}

type ListRow = Prisma.AiConversationGetPayload<{
  include: {
    project: typeof PROJECT_REF;
    _count: { select: { messages: true } };
    messages: { select: { role: true; content: true; createdAt: true } };
  };
}>;

function toListRow(row: ListRow) {
  const last = row.messages[0];
  return {
    ...row,
    // The preview replaces the row it came from; sending both would put the
    // whole last answer in every list response.
    messages: undefined,
    messageCount: row._count.messages,
    lastMessageAt: last?.createdAt ?? row.updatedAt,
    preview: last ? last.content.replace(/\s+/g, ' ').slice(0, 140) : null,
  };
}
