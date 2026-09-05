import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { toVectorLiteral } from './embedding';

/** One retrieved passage, with everything needed to cite it. */
export interface Passage {
  id: string;
  entityType: EntityType;
  entityId: string;
  projectId: string | null;
  title: string;
  content: string;
  ordinal: number;
  score: number;
}

/**
 * Below this, a passage is noise. Cosine similarity over these vectors puts
 * unrelated text around 0.1–0.2, so 0.28 keeps the recall generous without
 * letting an unanswerable question return five random notes and look confident.
 */
const FLOOR = 0.28;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Nearest passages to a question (§35).
   *
   * `<=>` is pgvector's cosine distance, so `1 - distance` is similarity. An
   * exact-phrase bonus rides on top: an error message pasted verbatim should
   * find the note that contains it verbatim, which pure vector distance is
   * surprisingly bad at once the passage is long.
   */
  async search(
    userId: string,
    query: string,
    options: { limit?: number; projectId?: string; types?: EntityType[]; exclude?: string } = {},
  ): Promise<Passage[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const vector = toVectorLiteral(await this.embeddings.embedOne(trimmed));
    const limit = Math.min(options.limit ?? 8, 40);

    const rows = await this.prisma.$queryRaw<(Passage & { score: number })[]>`
      SELECT id, "entityType", "entityId", "projectId", title, content, ordinal,
             (1 - (embedding <=> ${vector}::vector))
               + CASE WHEN content ILIKE ${`%${trimmed}%`} THEN 0.15 ELSE 0 END AS score
      FROM chunks
      WHERE "userId" = ${userId}::uuid
        ${options.projectId ? Prisma.sql`AND "projectId" = ${options.projectId}::uuid` : Prisma.empty}
        ${options.types?.length ? Prisma.sql`AND "entityType" = ANY(${options.types}::"EntityType"[])` : Prisma.empty}
        ${options.exclude ? Prisma.sql`AND "entityId" <> ${options.exclude}::uuid` : Prisma.empty}
      ORDER BY score DESC
      LIMIT ${limit * 3}`;

    return this.bestPerRecord(rows, limit).filter((row) => row.score >= FLOOR);
  }

  /**
   * One passage per source record.
   *
   * Without this, a long document with three good paragraphs fills the whole
   * result and hides four other records that also knew the answer. Breadth is
   * worth more than depth when the next step is citing sources.
   */
  private bestPerRecord(rows: Passage[], limit: number): Passage[] {
    const best = new Map<string, Passage>();
    for (const row of rows) {
      const existing = best.get(row.entityId);
      if (!existing || row.score > existing.score) best.set(row.entityId, row);
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * "Have I solved something like this before?" (§35). Takes free text — an
   * error message pasted straight from a terminal — and looks only at recorded
   * solutions and issues.
   */
  async similarSolutions(userId: string, text: string, exclude?: string): Promise<Passage[]> {
    return this.search(userId, text, {
      limit: 6,
      types: [EntityType.SOLUTION, EntityType.ISSUE],
      exclude,
    });
  }

  /** What is in the index, and what it was built with. */
  async stats(userId: string): Promise<{
    chunks: number;
    records: number;
    byType: { entityType: EntityType; records: number; chunks: number }[];
    models: string[];
    lastIndexedAt: string | null;
  }> {
    const rows = await this.prisma.$queryRaw<
      { entityType: EntityType; records: bigint; chunks: bigint }[]
    >`
      SELECT "entityType", COUNT(DISTINCT "entityId") AS records, COUNT(*) AS chunks
      FROM chunks WHERE "userId" = ${userId}::uuid
      GROUP BY "entityType" ORDER BY chunks DESC`;

    const [meta] = await this.prisma.$queryRaw<{ models: string[]; last: Date | null }[]>`
      SELECT array_agg(DISTINCT model) AS models, MAX("createdAt") AS last
      FROM chunks WHERE "userId" = ${userId}::uuid`;

    const byType = rows.map((row) => ({
      entityType: row.entityType,
      records: Number(row.records),
      chunks: Number(row.chunks),
    }));

    return {
      chunks: byType.reduce((sum, row) => sum + row.chunks, 0),
      records: byType.reduce((sum, row) => sum + row.records, 0),
      byType,
      models: meta?.models ?? [],
      lastIndexedAt: meta?.last?.toISOString() ?? null,
    };
  }
}
