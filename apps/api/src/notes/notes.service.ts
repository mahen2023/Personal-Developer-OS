import { Injectable } from '@nestjs/common';
import { EntityType, NoteType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { PaginationDto, page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { CreateNoteDto, NoteQueryDto, UpdateNoteDto } from './notes.dto';

const SORTABLE = ['updatedAt', 'createdAt', 'title'] as const;

/** List rows carry a preview rather than the whole body. */
const PREVIEW_LENGTH = 180;

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
  ) {}

  async list(userId: string, dto: NoteQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.NOTE, dto.tags ?? []);

    const where: Prisma.NoteWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.type?.length ? { type: { in: dto.type } } : {}),
      ...(dto.pinned ? { isPinned: true } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['title', 'content']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.note.findMany({
        where,
        // Pinned notes float regardless of the chosen sort — that is what
        // pinning means, and applying it after the fact would break paging.
        orderBy: [{ isPinned: 'desc' }, pageArgs(dto, SORTABLE, 'updatedAt').orderBy],
        skip: dto.skip,
        take: dto.limit,
        include: { project: PROJECT_REF },
      }),
      this.prisma.note.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.NOTE,
      rows.map((row) => row.id),
    );

    return page(
      rows.map(({ content, ...note }) => ({
        ...note,
        preview: preview(content),
        tags: tagMap.get(note.id) ?? [],
      })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const note = found(
      await this.prisma.note.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF },
      }),
      'note',
    );
    return {
      ...note,
      tags: await this.tags.forEntity(userId, EntityType.NOTE, id),
      links: await this.links.forEntity(userId, EntityType.NOTE, id),
    };
  }

  async create(userId: string, dto: CreateNoteDto) {
    const note = await this.prisma.note.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        content: dto.content ?? '',
        type: dto.type ?? NoteType.GENERAL,
        isPinned: dto.isPinned ?? false,
      },
    });

    await this.tags.setFor(userId, EntityType.NOTE, note.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: note.projectId,
      action: 'note.created',
      entityType: EntityType.NOTE,
      entityId: note.id,
      summary: `Created note ${note.title}`,
    });
    void this.indexer.touch(userId, 'note', note.id);
    return this.get(userId, note.id);
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    found(
      await this.prisma.note.findFirst({ where: { id, userId }, select: { id: true } }),
      'note',
    );

    const note = await this.prisma.note.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        content: dto.content,
        type: dto.type,
        isPinned: dto.isPinned,
      },
    });

    await this.tags.setFor(userId, EntityType.NOTE, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: note.projectId,
      action: 'note.updated',
      entityType: EntityType.NOTE,
      entityId: id,
      summary: `Updated note ${note.title}`,
    });
    void this.indexer.touch(userId, 'note', id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const note = found(await this.prisma.note.findFirst({ where: { id, userId } }), 'note');
    await this.prisma.note.delete({ where: { id } });
    await this.tags.detachAll(EntityType.NOTE, id);
    await this.links.detachAll(EntityType.NOTE, id);
    await this.activity.record({
      userId,
      projectId: note.projectId,
      action: 'note.deleted',
      entityType: EntityType.NOTE,
      summary: `Deleted note ${note.title}`,
    });
    await this.indexer.forget(EntityType.NOTE, id);
  }

  /** Powers "notes about this server" on any entity page. */
  async forEntity(userId: string, type: EntityType, entityId: string, dto: PaginationDto) {
    const linked = await this.links.forEntity(userId, type, entityId);
    const ids = linked.filter((ref) => ref.type === EntityType.NOTE).map((ref) => ref.id);
    const where: Prisma.NoteWhereInput = { userId, id: { in: ids } };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.note.findMany({ where, ...pageArgs(dto, SORTABLE, 'updatedAt') }),
      this.prisma.note.count({ where }),
    ]);
    return page(
      rows.map(({ content, ...note }) => ({ ...note, preview: preview(content) })),
      total,
      dto,
    );
  }
}

/** First meaningful line of markdown, with the syntax stripped. */
function preview(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > PREVIEW_LENGTH ? `${plain.slice(0, PREVIEW_LENGTH)}…` : plain;
}
