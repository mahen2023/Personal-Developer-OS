import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { IndexerService, type SourceName } from '../ai/indexer.service';
import { PaginationDto, page } from './dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from './query';

/**
 * The shared half of a module.
 *
 * Six modules — repositories, snippets, commands, ideas, bookmarks, learning —
 * differ only in their columns. Everything else is identical: scope by user,
 * filter by project and tags, page, record activity, keep tags and links in
 * step on delete. That is what lives here.
 *
 * Anything a module does that is genuinely its own (auto-numbering an ADR,
 * resolving an issue, promoting meeting action items into tasks) stays in that
 * module's own service. This base is for the repetition, not for the logic.
 */

export interface CrudConfig<TCreate, TUpdate> {
  /** Prisma delegate name, e.g. `repository`. */
  model: string;
  entityType: EntityType;
  /** Used in error messages and activity lines: "repository". */
  label: string;
  /** Column holding the human name — `name` or `title`. */
  titleField: 'name' | 'title';
  searchFields: string[];
  sortable: readonly string[];
  defaultSort: string;
  /** Direction for defaultSort when no ?sort= is given. Defaults to desc. */
  defaultOrder?: 'asc' | 'desc';
  /**
   * Keeps this type in the retrieval index (§35). Only set it for records that
   * hold prose worth quoting back — a bookmark is a URL and a title, and
   * indexing it would only crowd out the notes that actually say something.
   */
  indexAs?: SourceName;
  /** Relations to include on list and get. */
  include?: Record<string, unknown>;
  toCreate: (dto: TCreate) => Record<string, unknown>;
  toUpdate: (dto: TUpdate) => Record<string, unknown>;
  /** Module-specific `where` fragments built from its query DTO. */
  filter?: (dto: never) => Record<string, unknown>;
  /**
   * Adds derived fields to every row on the way out — `daysLeft` on a
   * certificate, for example. Computed on read so it can never go stale, and
   * computed here so the list and the detail view always agree.
   */
  decorate?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * A structural view of a Prisma delegate. Prisma's generated argument types are
 * per-model and cannot be expressed generically, so this is the one place the
 * app steps outside them — deliberately, and behind a typed public surface.
 */
interface Delegate {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface TaggedQueryDto extends PaginationDto {
  projectId?: string;
  tags?: string[];
}

export abstract class CrudService<TCreate, TUpdate, TQuery extends TaggedQueryDto> {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly activity: ActivityService,
    protected readonly tags: TagsService,
    protected readonly links: LinksService,
    protected readonly config: CrudConfig<TCreate, TUpdate>,
    /** Optional: only the subclasses that set `indexAs` pass one. */
    protected readonly indexer?: IndexerService,
  ) {}

  protected get delegate(): Delegate {
    return this.prisma[this.config.model as keyof PrismaService] as unknown as Delegate;
  }

  async list(userId: string, dto: TQuery) {
    const tagged = await this.tags.entityIdsWithTags(
      userId,
      this.config.entityType,
      dto.tags ?? [],
    );
    const where = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(tagged ? { id: { in: tagged } } : {}),
      ...search(dto.q, this.config.searchFields),
      ...(this.config.filter?.(dto as never) ?? {}),
    };

    const [rows, total] = await Promise.all([
      this.delegate.findMany({
        where,
        ...pageArgs(dto, this.config.sortable, this.config.defaultSort, this.config.defaultOrder),
        include: { project: PROJECT_REF, ...this.config.include },
      }),
      this.delegate.count({ where }),
    ]);

    const tagMap = await this.tags.forEntities(
      userId,
      this.config.entityType,
      rows.map((row) => String(row.id)),
    );
    return page(
      rows.map((row) => ({
        ...(this.config.decorate?.(row) ?? row),
        tags: tagMap.get(String(row.id)) ?? [],
      })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const row = found(
      await this.delegate.findFirst({
        where: { id, userId },
        include: { project: PROJECT_REF, ...this.config.include },
      }),
      this.config.label,
    );
    return {
      ...(this.config.decorate?.(row) ?? row),
      tags: await this.tags.forEntity(userId, this.config.entityType, id),
      links: await this.links.forEntity(userId, this.config.entityType, id),
    };
  }

  async create(userId: string, dto: TCreate & { projectId?: string | null; tags?: string[] }) {
    const row = await this.delegate.create({
      data: { userId, projectId: dto.projectId ?? null, ...this.config.toCreate(dto) },
    });

    await this.tags.setFor(userId, this.config.entityType, String(row.id), dto.tags);
    await this.activity.record({
      userId,
      projectId: (row.projectId as string | null) ?? null,
      action: `${this.config.label}.created`,
      entityType: this.config.entityType,
      entityId: String(row.id),
      summary: `Added ${this.config.label} ${String(row[this.config.titleField])}`,
    });
    this.reindex(userId, String(row.id));
    return this.get(userId, String(row.id));
  }

  async update(
    userId: string,
    id: string,
    dto: TUpdate & { projectId?: string | null; tags?: string[] },
  ) {
    found(
      await this.delegate.findFirst({ where: { id, userId }, select: { id: true } }),
      this.config.label,
    );

    const row = await this.delegate.update({
      where: { id },
      data: {
        // `undefined` leaves the column alone; `null` clears it. Distinguishing
        // the two is what lets a PATCH be genuinely partial.
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        ...this.config.toUpdate(dto),
      },
    });

    await this.tags.setFor(userId, this.config.entityType, id, dto.tags);
    await this.activity.record({
      userId,
      projectId: (row.projectId as string | null) ?? null,
      action: `${this.config.label}.updated`,
      entityType: this.config.entityType,
      entityId: id,
      summary: `Updated ${this.config.label} ${String(row[this.config.titleField])}`,
    });
    this.reindex(userId, id);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = found(await this.delegate.findFirst({ where: { id, userId } }), this.config.label);

    await this.delegate.delete({ where: { id } });
    // Polymorphic references have no foreign key to cascade, so they are
    // cleaned up here or they outlive the row they point at.
    await this.tags.detachAll(this.config.entityType, id);
    await this.links.detachAll(this.config.entityType, id);

    await this.activity.record({
      userId,
      projectId: (row.projectId as string | null) ?? null,
      action: `${this.config.label}.deleted`,
      entityType: this.config.entityType,
      summary: `Deleted ${this.config.label} ${String(row[this.config.titleField])}`,
    });
    if (this.config.indexAs) await this.indexer?.forget(this.config.entityType, id);
  }

  /**
   * Not awaited: re-embedding is an enhancement to a save that has already
   * succeeded, and the caller should not wait on it or fail because of it.
   */
  private reindex(userId: string, id: string): void {
    if (this.config.indexAs) void this.indexer?.touch(userId, this.config.indexAs, id);
  }

  /** Bumps a "how often have I reached for this" counter. */
  protected async increment(userId: string, id: string, column: string) {
    found(
      await this.delegate.findFirst({ where: { id, userId }, select: { id: true } }),
      this.config.label,
    );
    await this.delegate.update({ where: { id }, data: { [column]: { increment: 1 } } });
    return this.get(userId, id);
  }
}
