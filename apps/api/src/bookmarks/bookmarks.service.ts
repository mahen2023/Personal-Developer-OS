import { Injectable } from '@nestjs/common';
import { BookmarkCategory, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { BookmarkQueryDto, CreateBookmarkDto, UpdateBookmarkDto } from './bookmarks.dto';

/** Host patterns that reliably imply a category, so it rarely has to be picked. */
const BY_HOST: [RegExp, BookmarkCategory][] = [
  [/github\.com|gitlab\.com|bitbucket\.org/i, BookmarkCategory.GITHUB],
  [
    /aws\.amazon\.com|cloud\.google\.com|azure\.microsoft\.com|cloudflare\.com/i,
    BookmarkCategory.CLOUD,
  ],
  [/anthropic\.com|openai\.com|huggingface\.co/i, BookmarkCategory.AI],
  [/postgresql\.org|mongodb\.com|redis\.io|mysql\.com/i, BookmarkCategory.DATABASE],
  [/docker\.com|kubernetes\.io|terraform\.io|ansible\.com/i, BookmarkCategory.DEVOPS],
  [/owasp\.org|cve\.mitre\.org|nvd\.nist\.gov/i, BookmarkCategory.SECURITY],
  [/docs\.|developer\.|\/docs\//i, BookmarkCategory.DOCUMENTATION],
];

export function categoryFromUrl(url: string): BookmarkCategory {
  return BY_HOST.find(([pattern]) => pattern.test(url))?.[1] ?? BookmarkCategory.OTHER;
}

@Injectable()
export class BookmarksService extends CrudService<
  CreateBookmarkDto,
  UpdateBookmarkDto,
  BookmarkQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'bookmark',
      entityType: EntityType.BOOKMARK,
      label: 'bookmark',
      titleField: 'title',
      searchFields: ['title', 'url', 'description'],
      sortable: ['createdAt', 'updatedAt', 'title', 'category'],
      defaultSort: 'createdAt',
      filter: (dto: BookmarkQueryDto) => (dto.category ? { category: dto.category } : {}),
      toCreate: (dto) => ({
        title: dto.title.trim(),
        url: dto.url.trim(),
        description: dto.description,
        category: dto.category ?? categoryFromUrl(dto.url),
      }),
      toUpdate: (dto) => ({
        title: dto.title?.trim(),
        url: dto.url?.trim(),
        description: dto.description,
        category: dto.category,
      }),
    });
  }
}
