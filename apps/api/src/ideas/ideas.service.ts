import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { CreateIdeaDto, IdeaQueryDto, UpdateIdeaDto } from './ideas.dto';

@Injectable()
export class IdeasService extends CrudService<CreateIdeaDto, UpdateIdeaDto, IdeaQueryDto> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'idea',
      entityType: EntityType.IDEA,
      label: 'idea',
      titleField: 'title',
      searchFields: ['title', 'description', 'category'],
      sortable: ['updatedAt', 'createdAt', 'title', 'priority', 'status'],
      defaultSort: 'updatedAt',
      filter: (dto: IdeaQueryDto) => ({
        ...(dto.status?.length ? { status: { in: dto.status } } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.category ? { category: dto.category } : {}),
      }),
      toCreate: (dto) => ({
        title: dto.title.trim(),
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        status: dto.status,
      }),
      toUpdate: (dto) => ({
        title: dto.title?.trim(),
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        status: dto.status,
      }),
    });
  }
}
