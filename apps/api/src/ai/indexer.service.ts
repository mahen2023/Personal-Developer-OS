import { Injectable, Logger } from '@nestjs/common';
import { buffer } from 'node:stream/consumers';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorage } from '../storage/file-storage.service';
import { EmbeddingService } from './embedding.service';
import { chunk, compose } from './chunking';
import { toVectorLiteral } from './embedding';
import { extractText } from './extract';

/** One record, flattened into the text that will be searched. */
interface Indexable {
  id: string;
  projectId: string | null;
  title: string;
  text: string;
  updatedAt: Date;
}

/**
 * Everything that can be asked about later (§35).
 *
 * A record earns a place here by containing prose someone wrote. Tasks,
 * bookmarks and infrastructure rows are deliberately absent: they are answered
 * far better by a query over their columns than by a paraphrase, and adding
 * them would drown the good chunks in one-line noise. Vault items are absent
 * for the obvious reason (§43) and always will be.
 */
const SOURCES: Record<
  string,
  {
    type: EntityType;
    load: (prisma: PrismaService, userId: string, id?: string) => Promise<Indexable[]>;
  }
> = {
  note: {
    type: EntityType.NOTE,
    load: async (prisma, userId, id) =>
      (await prisma.note.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        text: compose([
          ['', row.title],
          ['', row.content],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  solution: {
    type: EntityType.SOLUTION,
    load: async (prisma, userId, id) =>
      (await prisma.solution.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        text: compose([
          ['', row.title],
          ['Problem', row.problem],
          ['Error', row.errorMessage],
          ['Environment', row.environment],
          ['Root cause', row.rootCause],
          ['Solution', row.solution],
          ['Commands', row.commands.join('\n')],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  issue: {
    type: EntityType.ISSUE,
    load: async (prisma, userId, id) =>
      (await prisma.issue.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        text: compose([
          ['', row.title],
          ['Description', row.description],
          ['Error', row.errorMessage],
          ['Status', row.status],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  adr: {
    type: EntityType.ADR,
    load: async (prisma, userId, id) =>
      (await prisma.adr.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: `ADR-${String(row.number).padStart(3, '0')} ${row.title}`,
        text: compose([
          ['', row.title],
          ['Status', row.status],
          ['Context', row.context],
          ['Decision', row.decision],
          ['Consequences', row.consequences],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  meeting: {
    type: EntityType.MEETING,
    load: async (prisma, userId, id) =>
      (await prisma.meeting.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        text: compose([
          ['', row.title],
          ['Participants', row.participants.join(', ')],
          ['Discussion', row.discussion],
          ['Decisions', row.decisions],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  snippet: {
    type: EntityType.SNIPPET,
    load: async (prisma, userId, id) =>
      (await prisma.snippet.findMany({ where: { userId, ...(id ? { id } : {}) } })).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        text: compose([
          ['', row.title],
          ['Description', row.description],
          ['Code', row.code],
        ]),
        updatedAt: row.updatedAt,
      })),
  },

  document: {
    type: EntityType.DOCUMENT,
    // Documents carry their text on the row once extracted, so a re-index does
    // not re-parse the file. Extraction happens in `extractDocuments`.
    load: async (prisma, userId, id) =>
      (
        await prisma.document.findMany({
          where: { userId, extractedText: { not: null }, ...(id ? { id } : {}) },
        })
      ).map((row) => ({
        id: row.id,
        projectId: row.projectId,
        title: row.originalName,
        text: compose([
          ['', row.originalName],
          ['', row.extractedText],
        ]),
        updatedAt: row.updatedAt,
      })),
  },
};

export type SourceName = keyof typeof SOURCES;

export interface IndexReport {
  records: number;
  chunks: number;
  skipped: number;
  model: string;
}

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorage,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Rebuilds the index for one user.
   *
   * Always a full rebuild of whatever it touches: chunk rows are derived data,
   * a rebuild is cheap, and the alternative — tracking which fields changed —
   * is a cache invalidation problem nobody needs to own.
   */
  async reindex(userId: string, only?: SourceName): Promise<IndexReport> {
    const names = only ? [only] : (Object.keys(SOURCES) as SourceName[]);
    const report: IndexReport = { records: 0, chunks: 0, skipped: 0, model: this.embeddings.model };

    for (const name of names) {
      const source = SOURCES[name];
      const records = await source.load(this.prisma, userId);
      for (const record of records) {
        const written = await this.write(userId, source.type, record);
        report.records += 1;
        report.chunks += written;
        if (written === 0) report.skipped += 1;
      }
    }
    return report;
  }

  /** Re-indexes a single record, used after an edit. Never throws at the caller. */
  async touch(userId: string, name: SourceName, id: string): Promise<void> {
    try {
      const [record] = await SOURCES[name].load(this.prisma, userId, id);
      if (record) await this.write(userId, SOURCES[name].type, record);
      else await this.forget(SOURCES[name].type, id);
    } catch (caught) {
      // Indexing is an enhancement. A failure here must never fail the save
      // that triggered it, so it is logged and dropped.
      this.logger.warn(`Could not index ${name} ${id}: ${(caught as Error).message}`);
    }
  }

  async forget(entityType: EntityType, entityId: string): Promise<void> {
    await this.prisma.chunk.deleteMany({ where: { entityType, entityId } });
  }

  /**
   * Pulls text out of uploaded files that have not been read yet, so the index
   * can see them. Returns how many gained text.
   */
  async extractDocuments(userId: string): Promise<{ read: number; unreadable: number }> {
    const pending = await this.prisma.document.findMany({
      where: { userId, extractedAt: null },
      select: { id: true, mimeType: true, storageKey: true },
      take: 200,
    });

    let read = 0;
    let unreadable = 0;
    for (const document of pending) {
      const data = await this.storage
        .read(document.storageKey)
        .then(buffer)
        .catch(() => null);
      const result = data
        ? await extractText(document.mimeType, data)
        : { text: null, reason: 'The file is missing from storage.' };

      await this.prisma.document.update({
        where: { id: document.id },
        // `extractedAt` is set either way, so an unreadable file is attempted
        // once rather than on every single run.
        data: { extractedText: result.text, extractedAt: new Date() },
      });
      if (result.text) read += 1;
      else unreadable += 1;
    }
    return { read, unreadable };
  }

  /** Embeds a record and replaces its chunks. Returns the number written. */
  private async write(userId: string, entityType: EntityType, record: Indexable): Promise<number> {
    const pieces = chunk(record.text);
    if (pieces.length === 0) {
      await this.forget(entityType, record.id);
      return 0;
    }

    const vectors = await this.embeddings.embed(pieces);
    const model = this.embeddings.model;

    const rows = pieces.map(
      (content, ordinal) =>
        Prisma.sql`(
        gen_random_uuid(), ${userId}::uuid, ${entityType}::"EntityType", ${record.id}::uuid,
        ${record.projectId}::uuid, ${ordinal}, ${record.title.slice(0, 200)}, ${content},
        ${model}, ${toVectorLiteral(vectors[ordinal])}::vector
      )`,
    );

    // Replace rather than upsert: a record that lost a paragraph must lose the
    // chunk that held it, or the index will keep answering from deleted text.
    await this.prisma.$transaction([
      this.prisma.chunk.deleteMany({ where: { entityType, entityId: record.id } }),
      this.prisma.$executeRaw`
        INSERT INTO chunks (id, "userId", "entityType", "entityId", "projectId", ordinal, title, content, model, embedding)
        VALUES ${Prisma.join(rows)}`,
    ]);

    if (entityType === EntityType.DOCUMENT) {
      await this.prisma.document.update({
        where: { id: record.id },
        data: { indexedAt: new Date() },
      });
    }

    return pieces.length;
  }
}
