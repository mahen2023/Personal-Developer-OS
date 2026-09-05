import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService } from '../ai/indexer.service';
import { RetrievalService } from '../ai/retrieval.service';
import { page } from '../common/dto/pagination.dto';
import { PROJECT_REF, cleanList, found, pageArgs, scopeToProject, search } from '../common/query';
import { CreateSolutionDto, SolutionQueryDto, UpdateSolutionDto } from './solutions.dto';

const SORTABLE = ['updatedAt', 'createdAt', 'title', 'useCount'] as const;

/** Words too common to carry meaning when matching one problem against another. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'by',
  'as',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'not',
  'no',
  'can',
  'cannot',
  'could',
  'would',
  'should',
  'will',
  'when',
  'then',
  'than',
  'if',
  'error',
  'failed',
  'failure',
  'issue',
  'problem',
  'while',
  'after',
  'before',
  'during',
]);

@Injectable()
export class SolutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
    private readonly indexer: IndexerService,
    private readonly retrieval: RetrievalService,
  ) {}

  async list(userId: string, dto: SolutionQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.SOLUTION, dto.tags ?? []);
    const where: Prisma.SolutionWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, [
        'title',
        'problem',
        'errorMessage',
        'rootCause',
        'solution',
        'environment',
      ]),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.solution.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'updatedAt'),
        include: { project: PROJECT_REF },
      }),
      this.prisma.solution.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.SOLUTION,
      rows.map((row) => row.id),
    );
    return page(
      rows.map((solution) => ({ ...solution, tags: tagMap.get(solution.id) ?? [] })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const solution = found(
      await this.prisma.solution.findFirst({
        where: { id, userId },
        include: {
          project: PROJECT_REF,
          issues: { select: { id: true, title: true, status: true } },
        },
      }),
      'solution',
    );
    return {
      ...solution,
      tags: await this.tags.forEntity(userId, EntityType.SOLUTION, id),
      related: await this.similar(
        userId,
        `${solution.title} ${solution.problem} ${solution.errorMessage ?? ''}`,
        id,
      ),
    };
  }

  /**
   * "Have I solved something like this before?" (§14).
   *
   * Two passes, kept separate on purpose.
   *
   * Rare-word overlap first: an error message shares its distinctive nouns with
   * the solution that fixed it, and a literal error string is exactly what
   * exact matching is good at. Then the embedding index fills in what the words
   * missed — the same problem described differently a year later.
   *
   * Each match says which pass found it, because "shares: ECONNREFUSED, pgbouncer"
   * and "similar wording" are different claims and deserve different trust.
   */
  async similar(userId: string, text: string, excludeId?: string, limit = 5) {
    const terms = keywords(text);
    const nearby = await this.embedded(userId, text, excludeId);
    if (terms.length === 0) return nearby.slice(0, limit);

    const candidates = await this.prisma.solution.findMany({
      where: {
        userId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        OR: terms.map((term) => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' as const } },
            { problem: { contains: term, mode: 'insensitive' as const } },
            { errorMessage: { contains: term, mode: 'insensitive' as const } },
            { rootCause: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      },
      take: 40,
      select: {
        id: true,
        title: true,
        problem: true,
        errorMessage: true,
        rootCause: true,
        environment: true,
        useCount: true,
      },
    });

    const exact = candidates
      .map((candidate) => {
        const haystack =
          `${candidate.title} ${candidate.problem} ${candidate.errorMessage ?? ''} ${candidate.rootCause ?? ''}`.toLowerCase();
        const hits = terms.filter((term) => haystack.includes(term));
        return {
          id: candidate.id,
          title: candidate.title,
          environment: candidate.environment,
          // Overlap as a share of the query's distinctive words, nudged by how
          // often the solution has actually proved useful.
          score: Math.round((hits.length / terms.length) * 100) + Math.min(10, candidate.useCount),
          reason: hits.slice(0, 4).join(', '),
        };
      })
      .filter((match) => match.score >= 25)
      .sort((a, b) => b.score - a.score);

    const seen = new Set(exact.map((match) => match.id));
    return [...exact, ...nearby.filter((match) => !seen.has(match.id))].slice(0, limit);
  }

  /**
   * The embedding half. Returns nothing at all when the index has not been
   * built, which is why the keyword pass stays: this is an addition to the
   * feature, never a prerequisite for it.
   */
  private async embedded(userId: string, text: string, excludeId?: string) {
    const passages = await this.retrieval.similarSolutions(userId, text, excludeId).catch(() => []);

    return passages
      .filter((passage) => passage.entityType === EntityType.SOLUTION)
      .map((passage) => ({
        id: passage.entityId,
        title: passage.title,
        environment: null as string | null,
        // Scaled to sit below a strong word overlap: a shared error string is
        // firmer evidence than a similar-looking paragraph.
        score: Math.round(passage.score * 60),
        reason: 'similar wording',
      }));
  }

  async create(userId: string, dto: CreateSolutionDto) {
    const solution = await this.prisma.solution.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        title: dto.title.trim(),
        problem: dto.problem,
        errorMessage: dto.errorMessage,
        environment: dto.environment,
        rootCause: dto.rootCause,
        solution: dto.solution,
        commands: cleanList(dto.commands),
        links: cleanList(dto.links),
      },
    });

    await this.tags.setFor(userId, EntityType.SOLUTION, solution.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: solution.projectId,
      action: 'solution.created',
      entityType: EntityType.SOLUTION,
      entityId: solution.id,
      summary: `Solved: ${solution.title}`,
    });
    void this.indexer.touch(userId, 'solution', solution.id);
    return this.get(userId, solution.id);
  }

  async update(userId: string, id: string, dto: UpdateSolutionDto) {
    found(
      await this.prisma.solution.findFirst({ where: { id, userId }, select: { id: true } }),
      'solution',
    );
    const solution = await this.prisma.solution.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        title: dto.title?.trim(),
        problem: dto.problem,
        errorMessage: dto.errorMessage,
        environment: dto.environment,
        rootCause: dto.rootCause,
        solution: dto.solution,
        commands: dto.commands ? cleanList(dto.commands) : undefined,
        links: dto.links ? cleanList(dto.links) : undefined,
      },
    });

    await this.tags.setFor(userId, EntityType.SOLUTION, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: solution.projectId,
      action: 'solution.updated',
      entityType: EntityType.SOLUTION,
      entityId: id,
      summary: `Updated solution ${solution.title}`,
    });
    void this.indexer.touch(userId, 'solution', id);
    return this.get(userId, id);
  }

  /** Counts a reuse — the signal that a solution is worth keeping near the top. */
  async markUsed(userId: string, id: string) {
    found(
      await this.prisma.solution.findFirst({ where: { id, userId }, select: { id: true } }),
      'solution',
    );
    await this.prisma.solution.update({ where: { id }, data: { useCount: { increment: 1 } } });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const solution = found(
      await this.prisma.solution.findFirst({ where: { id, userId } }),
      'solution',
    );
    await this.prisma.solution.delete({ where: { id } });
    await this.tags.detachAll(EntityType.SOLUTION, id);
    await this.links.detachAll(EntityType.SOLUTION, id);
    await this.activity.record({
      userId,
      projectId: solution.projectId,
      action: 'solution.deleted',
      entityType: EntityType.SOLUTION,
      summary: `Deleted solution ${solution.title}`,
    });
    await this.indexer.forget(EntityType.SOLUTION, id);
  }
}

/** Distinctive lowercase words, longest first, capped so the OR stays sane. */
function keywords(text: string): string[] {
  const seen = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? []) {
    if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) seen.add(word);
  }
  return [...seen].sort((a, b) => b.length - a.length).slice(0, 12);
}
