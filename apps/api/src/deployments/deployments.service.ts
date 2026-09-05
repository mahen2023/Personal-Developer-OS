import { Injectable } from '@nestjs/common';
import { DeploymentStatus, EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { found, scopeToProject } from '../common/query';
import { ENVIRONMENT_REF } from '../servers/servers.service';
import {
  CreateDeploymentDto,
  DeploymentQueryDto,
  FinishDeploymentDto,
  UpdateDeploymentDto,
} from './deployments.dto';

@Injectable()
export class DeploymentsService extends CrudService<
  CreateDeploymentDto,
  UpdateDeploymentDto,
  DeploymentQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'deployment',
      entityType: EntityType.DEPLOYMENT,
      label: 'deployment',
      titleField: 'name',
      searchFields: ['version', 'commitSha', 'notes', 'deployedBy'],
      sortable: ['deployedAt', 'createdAt', 'status', 'version'],
      defaultSort: 'deployedAt',
      include: {
        environment: ENVIRONMENT_REF,
        repository: { select: { id: true, name: true, url: true, defaultBranch: true } },
        server: { select: { id: true, name: true, status: true } },
      },
      filter: (dto: DeploymentQueryDto) => ({
        ...(dto.status?.length ? { status: { in: dto.status } } : {}),
        ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
        ...(dto.repositoryId ? { repositoryId: dto.repositoryId } : {}),
        ...(dto.serverId ? { serverId: dto.serverId } : {}),
      }),
      // A deployment has no name of its own; the version is what identifies it.
      decorate: (row) => ({ ...row, name: row.version ?? 'deployment' }),
      toCreate: (dto) => ({
        version: dto.version,
        commitSha: dto.commitSha,
        status: dto.status ?? DeploymentStatus.IN_PROGRESS,
        deployedBy: dto.deployedBy,
        deployedAt: dto.deployedAt ? new Date(dto.deployedAt) : new Date(),
        durationSec: dto.durationSec,
        notes: dto.notes,
        repositoryId: dto.repositoryId ?? null,
        environmentId: dto.environmentId ?? null,
        serverId: dto.serverId ?? null,
      }),
      toUpdate: (dto) => ({
        version: dto.version,
        commitSha: dto.commitSha,
        status: dto.status,
        deployedBy: dto.deployedBy,
        deployedAt: dto.deployedAt ? new Date(dto.deployedAt) : undefined,
        durationSec: dto.durationSec,
        notes: dto.notes,
        repositoryId: dto.repositoryId === undefined ? undefined : (dto.repositoryId ?? null),
        environmentId: dto.environmentId === undefined ? undefined : (dto.environmentId ?? null),
        serverId: dto.serverId === undefined ? undefined : (dto.serverId ?? null),
      }),
    });
  }

  /**
   * Closes out a deployment that was recorded as in-progress, filling in the
   * duration from when it started. Separate from update() because it is the
   * one thing you do from a terminal, and it should be a single call.
   */
  async finish(userId: string, id: string, dto: FinishDeploymentDto) {
    const deployment = found(
      await this.prisma.deployment.findFirst({ where: { id, userId } }),
      'deployment',
    );

    const durationSec =
      dto.durationSec ?? Math.round((Date.now() - deployment.deployedAt.getTime()) / 1000);

    await this.prisma.deployment.update({
      where: { id },
      data: { status: dto.status, durationSec, notes: dto.notes ?? deployment.notes },
    });

    await this.activity.record({
      userId,
      projectId: deployment.projectId,
      action: `deployment.${dto.status.toLowerCase()}`,
      entityType: EntityType.DEPLOYMENT,
      entityId: id,
      summary:
        dto.status === DeploymentStatus.SUCCESS
          ? `Deployed ${deployment.version ?? 'a release'} successfully`
          : `Deployment ${deployment.version ?? ''} ended as ${dto.status.toLowerCase().replace('_', ' ')}`,
    });
    return this.get(userId, id);
  }

  /**
   * The deployment timeline (§21), grouped by day and newest first — the shape
   * the UI draws, computed once here rather than in every caller.
   */
  async timeline(userId: string, dto: DeploymentQueryDto) {
    const where: Prisma.DeploymentWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
      ...(dto.repositoryId ? { repositoryId: dto.repositoryId } : {}),
    };

    const items = await this.prisma.deployment.findMany({
      where,
      orderBy: { deployedAt: 'desc' },
      take: 200,
      include: {
        environment: ENVIRONMENT_REF,
        repository: { select: { id: true, name: true } },
        server: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, slug: true, color: true } },
      },
    });

    const days = new Map<string, typeof items>();
    for (const deployment of items) {
      const key = deployment.deployedAt.toISOString().slice(0, 10);
      days.set(key, [...(days.get(key) ?? []), deployment]);
    }

    const succeeded = items.filter((item) => item.status === DeploymentStatus.SUCCESS).length;
    return {
      days: [...days.entries()].map(([date, deployments]) => ({ date, deployments })),
      stats: {
        total: items.length,
        succeeded,
        failed: items.filter((item) => item.status === DeploymentStatus.FAILED).length,
        rolledBack: items.filter((item) => item.status === DeploymentStatus.ROLLED_BACK).length,
        successRate: items.length > 0 ? Math.round((succeeded / items.length) * 100) : null,
      },
    };
  }
}
