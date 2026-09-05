import { Injectable } from '@nestjs/common';
import { EntityType, LearningStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { CreateLearningDto, LearningQueryDto, UpdateLearningDto } from './learning.dto';

/**
 * Progress and status are two views of the same fact, so the service keeps
 * them consistent rather than trusting the client to send both correctly:
 * 100% means completed, and completing something means 100%.
 */
function reconcile(
  status: LearningStatus | undefined,
  progress: number | undefined,
): { status?: LearningStatus; progress?: number; startedAt?: Date; finishedAt?: Date | null } {
  if (status === LearningStatus.COMPLETED || progress === 100) {
    return { status: LearningStatus.COMPLETED, progress: 100, finishedAt: new Date() };
  }
  if (status === LearningStatus.LEARNING || (progress !== undefined && progress > 0)) {
    return {
      status: status ?? LearningStatus.LEARNING,
      progress,
      startedAt: new Date(),
      finishedAt: null,
    };
  }
  return { status, progress };
}

@Injectable()
export class LearningService extends CrudService<
  CreateLearningDto,
  UpdateLearningDto,
  LearningQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'learningItem',
      entityType: EntityType.LEARNING,
      label: 'learning item',
      titleField: 'title',
      searchFields: ['title', 'technology', 'notes', 'url'],
      sortable: ['updatedAt', 'createdAt', 'title', 'status', 'progress'],
      defaultSort: 'updatedAt',
      filter: (dto: LearningQueryDto) => ({
        ...(dto.status?.length ? { status: { in: dto.status } } : {}),
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.technology ? { technology: { equals: dto.technology, mode: 'insensitive' } } : {}),
      }),
      toCreate: (dto) => ({
        title: dto.title.trim(),
        technology: dto.technology,
        kind: dto.kind,
        url: dto.url,
        notes: dto.notes,
        ...reconcile(dto.status, dto.progress),
      }),
      toUpdate: (dto) => ({
        title: dto.title?.trim(),
        technology: dto.technology,
        kind: dto.kind,
        url: dto.url,
        notes: dto.notes,
        ...reconcile(dto.status, dto.progress),
      }),
    });
  }
}
