import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { IndexerService } from '../ai/indexer.service';
import { CreateSnippetDto, SnippetQueryDto, UpdateSnippetDto } from './snippets.dto';

@Injectable()
export class SnippetsService extends CrudService<
  CreateSnippetDto,
  UpdateSnippetDto,
  SnippetQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
    indexer: IndexerService,
  ) {
    super(
      prisma,
      activity,
      tags,
      links,
      {
        model: 'snippet',
        entityType: EntityType.SNIPPET,
        label: 'snippet',
        titleField: 'title',
        // The code itself is searchable: finding a snippet by a function name
        // in it is the whole point.
        searchFields: ['title', 'code', 'description'],
        sortable: ['updatedAt', 'createdAt', 'title', 'language', 'useCount'],
        defaultSort: 'updatedAt',
        indexAs: 'snippet',
        filter: (dto: SnippetQueryDto) => (dto.language ? { language: dto.language } : {}),
        toCreate: (dto) => ({
          title: dto.title.trim(),
          language: (dto.language ?? 'text').toLowerCase(),
          code: dto.code,
          description: dto.description,
        }),
        toUpdate: (dto) => ({
          title: dto.title?.trim(),
          language: dto.language?.toLowerCase(),
          code: dto.code,
          description: dto.description,
        }),
      },
      indexer,
    );
  }

  /** Counts a copy, so the snippets you actually reach for float to the top. */
  markUsed(userId: string, id: string) {
    return this.increment(userId, id, 'useCount');
  }

  /** Languages in use, for the filter control — no fixed list to maintain. */
  async languages(userId: string): Promise<{ language: string; count: number }[]> {
    const grouped = await this.prisma.snippet.groupBy({
      by: ['language'],
      where: { userId },
      _count: { language: true },
      orderBy: { _count: { language: 'desc' } },
    });
    return grouped.map((row) => ({ language: row.language, count: row._count.language }));
  }
}
