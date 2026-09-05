import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, page } from '../common/dto/pagination.dto';
import { redact } from '../common/filters/all-exceptions.filter';

export interface ActivityInput {
  userId: string;
  action: string;
  summary: string;
  projectId?: string | null;
  entityType?: EntityType;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * The activity feed is written by every module and read by the dashboard, the
 * project workspace and each entity page. Recording is best-effort: a failed
 * audit line must never fail the user's actual write.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: ActivityInput): Promise<void> {
    await this.prisma.activity
      .create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          summary: input.summary,
          // redact() is applied even here — meta is developer-supplied and one
          // careless spread of a create-DTO would otherwise leak a secret.
          meta: (redact(input.meta ?? {}) ?? {}) as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  async list(userId: string, dto: PaginationDto, projectId?: string) {
    const where: Prisma.ActivityWhereInput = { userId, ...(projectId ? { projectId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
        include: { project: { select: { id: true, name: true, slug: true, color: true } } },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return page(items, total, dto);
  }
}
