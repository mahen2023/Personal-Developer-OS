import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityType, Prisma } from '@prisma/client';
import type { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { extractText } from '../ai/extract';
import { FileStorage } from '../storage/file-storage.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { DocumentQueryDto, UpdateDocumentDto, UploadDocumentDto } from './documents.dto';

const SORTABLE = ['createdAt', 'originalName', 'sizeBytes'] as const;

/**
 * What may be uploaded (§29). An allow-list, not a block-list: anything not
 * named here is refused, so a new dangerous type cannot slip in by default.
 */
const ALLOWED_TYPES = new Map<string, string>([
  ['application/pdf', 'PDF'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX'],
  ['application/msword', 'DOC'],
  ['application/vnd.ms-excel', 'XLS'],
  ['text/plain', 'Text'],
  ['text/markdown', 'Markdown'],
  ['text/csv', 'CSV'],
  ['application/json', 'JSON'],
  ['image/png', 'PNG'],
  ['image/jpeg', 'JPEG'],
  ['image/gif', 'GIF'],
  ['image/webp', 'WebP'],
  ['image/svg+xml', 'SVG'],
]);

/**
 * Types a browser paints without running anything on this origin. SVG is
 * absent on purpose: an inline SVG executes script, which is the XSS problem
 * the unconditional `attachment` was there to stop. Everything else, asked for
 * inline or not, stays a download.
 */
const INLINE_SAFE = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function disposition(mimeType: string, inline: boolean): 'inline' | 'attachment' {
  return inline && INLINE_SAFE.has(mimeType) ? 'inline' : 'attachment';
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorage,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
    config: ConfigService,
  ) {
    this.maxBytes = (config.get<number>('storage.maxFileMb') ?? 50) * 1024 * 1024;
  }

  async list(userId: string, dto: DocumentQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.DOCUMENT, dto.tags ?? []);
    const where: Prisma.DocumentWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.ownerType ? { ownerType: dto.ownerType } : {}),
      ...(dto.ownerId ? { ownerId: dto.ownerId } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['originalName']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'createdAt'),
        include: { project: PROJECT_REF },
      }),
      this.prisma.document.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.DOCUMENT,
      rows.map((row) => row.id),
    );
    return page(
      rows.map((document) => ({
        ...document,
        kind: ALLOWED_TYPES.get(document.mimeType) ?? 'File',
        tags: tagMap.get(document.id) ?? [],
      })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const document = found(
      await this.prisma.document.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF },
      }),
      'document',
    );
    return {
      ...document,
      kind: ALLOWED_TYPES.get(document.mimeType) ?? 'File',
      tags: await this.tags.forEntity(userId, EntityType.DOCUMENT, id),
      links: await this.links.forEntity(userId, EntityType.DOCUMENT, id),
    };
  }

  async upload(userId: string, file: UploadedFile | undefined, dto: UploadDocumentDto) {
    if (!file) throw new BadRequestException('No file was attached.');
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `${file.mimetype} files are not supported. Allowed: ${[...new Set(ALLOWED_TYPES.values())].join(', ')}.`,
      );
    }
    if (file.size > this.maxBytes) {
      throw new BadRequestException(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${this.maxBytes / 1024 / 1024} MB.`,
      );
    }

    const stored = await this.storage.put(userId, file.originalname, file.buffer);

    // Read the text now, while the bytes are already in hand — re-opening a
    // 40 MB PDF later to learn it is a scan would be work for nothing.
    const extracted = await extractText(file.mimetype, file.buffer).catch(() => ({ text: null }));

    const document = await this.prisma.document.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        fileName: stored.key.split('/').pop() ?? stored.key,
        originalName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.key,
        checksum: stored.checksum,
        ownerType: dto.ownerType ?? EntityType.PROJECT,
        ownerId: dto.ownerId ?? dto.projectId ?? null,
        extractedText: extracted.text,
        extractedAt: new Date(),
      },
    });

    await this.tags.setFor(userId, EntityType.DOCUMENT, document.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: document.projectId,
      action: 'document.uploaded',
      entityType: EntityType.DOCUMENT,
      entityId: document.id,
      summary: `Uploaded ${document.originalName}`,
      meta: { sizeBytes: document.sizeBytes, mimeType: document.mimeType },
    });
    void this.indexer.touch(userId, 'document', document.id);
    return this.get(userId, document.id);
  }

  /** Ownership is re-checked here; the storage key alone grants nothing. */
  async download(
    userId: string,
    id: string,
  ): Promise<{ stream: Readable; mimeType: string; filename: string; size: number }> {
    const document = found(
      await this.prisma.document.findFirst({ where: { id, userId } }),
      'document',
    );
    if (!(await this.storage.exists(document.storageKey))) {
      throw new BadRequestException(
        'The record exists but its file is missing from storage. It may have been removed outside the app.',
      );
    }
    return {
      stream: await this.storage.read(document.storageKey),
      mimeType: document.mimeType,
      filename: document.originalName,
      size: document.sizeBytes,
    };
  }

  async update(userId: string, id: string, dto: UpdateDocumentDto) {
    found(
      await this.prisma.document.findFirst({ where: { id, userId }, select: { id: true } }),
      'document',
    );
    await this.prisma.document.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        originalName: dto.originalName?.trim(),
        ownerType: dto.ownerType,
        ownerId: dto.ownerId === undefined ? undefined : (dto.ownerId ?? null),
      },
    });
    await this.tags.setFor(userId, EntityType.DOCUMENT, id, dto.tags);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const document = found(
      await this.prisma.document.findFirst({ where: { id, userId } }),
      'document',
    );

    // The row goes first. A failed unlink then leaves an orphaned blob, which
    // is recoverable; the reverse leaves a record pointing at nothing.
    await this.prisma.document.delete({ where: { id } });
    await this.storage.delete(document.storageKey).catch(() => undefined);
    await this.tags.detachAll(EntityType.DOCUMENT, id);
    await this.links.detachAll(EntityType.DOCUMENT, id);

    await this.activity.record({
      userId,
      projectId: document.projectId,
      action: 'document.deleted',
      entityType: EntityType.DOCUMENT,
      summary: `Deleted ${document.originalName}`,
    });
    await this.indexer.forget(EntityType.DOCUMENT, id);
  }

  static allowedMimeTypes(): string[] {
    return [...ALLOWED_TYPES.keys()];
  }
}
