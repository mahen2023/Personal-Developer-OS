import { ConflictException, Injectable } from '@nestjs/common';
import { EntityType, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { page } from '../common/dto/pagination.dto';
import { cleanList, found, pageArgs, search } from '../common/query';
import { slugify } from '../common/slug';
import { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './projects.dto';

const SORTABLE = ['updatedAt', 'createdAt', 'name', 'targetDate', 'priority', 'progress'] as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly tags: TagsService,
    private readonly links: LinksService,
  ) {}

  async list(userId: string, dto: ProjectQueryDto) {
    const tagged = await this.tags.entityIdsWithTags(userId, EntityType.PROJECT, dto.tags ?? []);

    const where: Prisma.ProjectWhereInput = {
      userId,
      ...(dto.status?.length ? { status: { in: dto.status } } : {}),
      ...(dto.priority ? { priority: dto.priority } : {}),
      ...(dto.favorite ? { isFavorite: true } : {}),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, ['name', 'description', 'client']),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'updatedAt'),
        include: { _count: COUNTS },
      }),
      this.prisma.project.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      EntityType.PROJECT,
      items.map((item) => item.id),
    );

    return page(
      items.map(({ _count, ...project }) => ({
        ...project,
        counts: _count,
        tags: tagMap.get(project.id) ?? [],
      })),
      total,
      dto,
    );
  }

  /** Projects are addressed by slug in the UI, but ids still work. */
  async get(userId: string, idOrSlug: string) {
    const project = found(
      await this.prisma.project.findFirst({
        where: { userId, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) },
        include: { _count: COUNTS },
      }),
      'project',
    );

    const { _count, ...rest } = project;
    return {
      ...rest,
      counts: _count,
      tags: await this.tags.forEntity(userId, EntityType.PROJECT, project.id),
    };
  }

  /**
   * Everything the project workspace shows on one request. Loading each tab
   * separately would be six round trips for a screen that is meant to feel
   * like opening a folder.
   */
  async workspace(userId: string, idOrSlug: string) {
    const project = await this.get(userId, idOrSlug);
    const where = { projectId: project.id };

    const [
      repositories,
      environments,
      servers,
      databases,
      domains,
      certificates,
      deployments,
      tasks,
      notes,
      solutions,
      documents,
      adrs,
      activities,
    ] = await this.prisma.$transaction([
      this.prisma.repository.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.environment.findMany({ where, orderBy: { type: 'asc' } }),
      this.prisma.server.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.databaseInstance.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.domain.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.sslCertificate.findMany({ where, orderBy: { expiresAt: 'asc' } }),
      this.prisma.deployment.findMany({ where, orderBy: { deployedAt: 'desc' }, take: 20 }),
      this.prisma.task.findMany({
        where: { ...where, status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] } },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 20,
      }),
      this.prisma.note.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 20 }),
      this.prisma.solution.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 20 }),
      this.prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.adr.findMany({ where, orderBy: { number: 'asc' } }),
      this.prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, take: 25 }),
    ]);

    return {
      project,
      health: health(servers, certificates, deployments, databases),
      infrastructure: { repositories, environments, servers, databases, domains, certificates },
      work: { tasks, notes, solutions, documents, adrs },
      deployments,
      activities,
    };
  }

  /**
   * The context graph (§11). Nodes and edges are derived from the real foreign
   * keys plus any free-form links, so the picture cannot drift from the data.
   */
  async graph(userId: string, idOrSlug: string) {
    const { project, infrastructure, work, deployments } = await this.workspace(userId, idOrSlug);

    const nodes: { id: string; type: EntityType; label: string; detail?: string }[] = [
      { id: project.id, type: EntityType.PROJECT, label: project.name, detail: project.status },
    ];
    const edges: { from: string; to: string; kind: string }[] = [];

    const add = (
      type: EntityType,
      rows: { id: string; environmentId?: string | null; serverId?: string | null }[],
      label: (row: never) => string,
      detail?: (row: never) => string | undefined,
    ) => {
      for (const row of rows) {
        nodes.push({
          id: row.id,
          type,
          label: label(row as never),
          detail: detail?.(row as never),
        });
        edges.push({ from: project.id, to: row.id, kind: 'belongs-to' });
        // A server in an environment hangs off the environment, not the project,
        // which is what makes the graph read as layers rather than a starburst.
        if (row.environmentId) edges.push({ from: row.environmentId, to: row.id, kind: 'in' });
        if (row.serverId) edges.push({ from: row.serverId, to: row.id, kind: 'runs-on' });
      }
    };

    add(EntityType.ENVIRONMENT, infrastructure.environments, (r: { name: string }) => r.name);
    add(EntityType.REPOSITORY, infrastructure.repositories, (r: { name: string }) => r.name);
    add(
      EntityType.SERVER,
      infrastructure.servers,
      (r: { name: string }) => r.name,
      (r: { ipAddress: string | null }) => r.ipAddress ?? undefined,
    );
    add(EntityType.DATABASE, infrastructure.databases, (r: { name: string }) => r.name);
    add(EntityType.DOMAIN, infrastructure.domains, (r: { name: string }) => r.name);
    add(
      EntityType.SSL_CERTIFICATE,
      infrastructure.certificates,
      (r: { commonName: string }) => r.commonName,
    );
    add(
      EntityType.DEPLOYMENT,
      deployments.slice(0, 8),
      (r: { version: string | null }) => r.version ?? 'deployment',
      (r: { status: string }) => r.status,
    );
    add(EntityType.NOTE, work.notes.slice(0, 12), (r: { title: string }) => r.title);
    add(EntityType.SOLUTION, work.solutions.slice(0, 12), (r: { title: string }) => r.title);

    const known = new Set(nodes.map((node) => node.id));
    const extra = await this.prisma.entityLink.findMany({
      where: { userId, OR: [{ fromId: { in: [...known] } }, { toId: { in: [...known] } }] },
    });
    for (const link of extra) {
      if (known.has(link.fromId) && known.has(link.toId)) {
        edges.push({ from: link.fromId, to: link.toId, kind: link.label ?? 'related' });
      }
    }

    return { nodes, edges };
  }

  async create(userId: string, dto: CreateProjectDto) {
    const slug = await this.uniqueSlug(userId, dto.name);
    const project = await this.prisma.project.create({
      data: {
        userId,
        slug,
        name: dto.name.trim(),
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        client: dto.client,
        color: dto.color,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        techStack: cleanList(dto.techStack),
        progress: dto.progress,
        isFavorite: dto.isFavorite,
      },
    });

    await this.tags.setFor(userId, EntityType.PROJECT, project.id, dto.tags);
    await this.activity.record({
      userId,
      projectId: project.id,
      action: 'project.created',
      entityType: EntityType.PROJECT,
      entityId: project.id,
      summary: `Created project ${project.name}`,
    });
    return this.get(userId, project.id);
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const existing = found(
      await this.prisma.project.findFirst({ where: { id, userId } }),
      'project',
    );

    // Renaming re-slugs, so a project URL always matches its name.
    const slug =
      dto.name && dto.name.trim() !== existing.name
        ? await this.uniqueSlug(userId, dto.name, id)
        : undefined;

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        slug,
        name: dto.name?.trim(),
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        client: dto.client,
        color: dto.color,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        techStack: dto.techStack ? cleanList(dto.techStack) : undefined,
        progress: dto.progress,
        isFavorite: dto.isFavorite,
      },
    });

    await this.tags.setFor(userId, EntityType.PROJECT, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: id,
      action: 'project.updated',
      entityType: EntityType.PROJECT,
      entityId: id,
      summary:
        existing.status !== project.status
          ? `Moved ${project.name} to ${project.status.toLowerCase().replace('_', ' ')}`
          : `Updated project ${project.name}`,
    });
    return this.get(userId, id);
  }

  /**
   * Deleting a project keeps its records. Every relation is `onDelete: SetNull`,
   * so notes and servers survive and simply become unfiled — losing a year of
   * notes because a project was archived would be unforgivable.
   */
  async remove(userId: string, id: string): Promise<void> {
    const project = found(
      await this.prisma.project.findFirst({ where: { id, userId } }),
      'project',
    );
    await this.prisma.project.delete({ where: { id } });
    await this.tags.detachAll(EntityType.PROJECT, id);
    await this.links.detachAll(EntityType.PROJECT, id);
    await this.activity.record({
      userId,
      action: 'project.deleted',
      entityType: EntityType.PROJECT,
      summary: `Deleted project ${project.name} — its records were kept, unfiled`,
    });
  }

  private async uniqueSlug(userId: string, name: string, ignoreId?: string): Promise<string> {
    const base = slugify(name) || 'project';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const clash = await this.prisma.project.findFirst({
        where: { userId, slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    throw new ConflictException('Too many projects share that name. Try a more specific one.');
  }
}

const COUNTS = {
  select: {
    repositories: true,
    environments: true,
    servers: true,
    databases: true,
    domains: true,
    certificates: true,
    deployments: true,
    notes: true,
    tasks: true,
    issues: true,
    solutions: true,
    snippets: true,
    commands: true,
    adrs: true,
    meetings: true,
    documents: true,
    bookmarks: true,
    vaultItems: true,
  },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The four indicators the project header shows (§72). */
function health(
  servers: { status: string }[],
  certificates: { expiresAt: Date }[],
  deployments: { status: string }[],
  databases: { lastBackupAt: Date | null }[],
) {
  const soonest = certificates.reduce<number | null>((best, certificate) => {
    const days = Math.ceil((certificate.expiresAt.getTime() - Date.now()) / 86_400_000);
    return best === null || days < best ? days : best;
  }, null);

  return {
    servers:
      servers.length === 0
        ? 'none'
        : servers.every((s) => s.status === 'ONLINE')
          ? 'ok'
          : 'attention',
    certificates:
      soonest === null ? 'none' : soonest <= 7 ? 'critical' : soonest <= 14 ? 'warning' : 'ok',
    deployment:
      deployments.length === 0 ? 'none' : deployments[0].status === 'SUCCESS' ? 'ok' : 'attention',
    backups:
      databases.length === 0
        ? 'none'
        : databases.every(
              (d) => d.lastBackupAt && Date.now() - d.lastBackupAt.getTime() < 7 * 86_400_000,
            )
          ? 'ok'
          : 'attention',
  };
}
