import { Injectable } from '@nestjs/common';
import { EntityType, RepoProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { CreateRepositoryDto, RepositoryQueryDto, UpdateRepositoryDto } from './repositories.dto';

/** Guesses the provider from the URL, so it rarely has to be chosen by hand. */
export function providerFromUrl(url: string): RepoProvider {
  const host = url.toLowerCase();
  if (host.includes('github.')) return RepoProvider.GITHUB;
  if (host.includes('gitlab.')) return RepoProvider.GITLAB;
  if (host.includes('bitbucket.')) return RepoProvider.BITBUCKET;
  if (host.includes('dev.azure.com') || host.includes('visualstudio.com')) {
    return RepoProvider.AZURE_DEVOPS;
  }
  return RepoProvider.OTHER;
}

@Injectable()
export class RepositoriesService extends CrudService<
  CreateRepositoryDto,
  UpdateRepositoryDto,
  RepositoryQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'repository',
      entityType: EntityType.REPOSITORY,
      label: 'repository',
      titleField: 'name',
      searchFields: ['name', 'description', 'url', 'localPath', 'language'],
      sortable: ['updatedAt', 'createdAt', 'name', 'provider'],
      defaultSort: 'updatedAt',
      include: {
        deployments: {
          take: 5,
          orderBy: { deployedAt: 'desc' },
          select: { id: true, version: true, status: true, deployedAt: true },
        },
      },
      filter: (dto: RepositoryQueryDto) => ({
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.language ? { language: { equals: dto.language, mode: 'insensitive' } } : {}),
      }),
      toCreate: (dto) => ({
        name: dto.name.trim(),
        provider: dto.provider ?? providerFromUrl(dto.url),
        url: dto.url.trim(),
        localPath: dto.localPath,
        defaultBranch: dto.defaultBranch ?? 'main',
        language: dto.language,
        description: dto.description,
        isPrivate: dto.isPrivate ?? true,
      }),
      toUpdate: (dto) => ({
        name: dto.name?.trim(),
        provider: dto.provider,
        url: dto.url?.trim(),
        localPath: dto.localPath,
        defaultBranch: dto.defaultBranch,
        language: dto.language,
        description: dto.description,
        isPrivate: dto.isPrivate,
      }),
    });
  }
}
