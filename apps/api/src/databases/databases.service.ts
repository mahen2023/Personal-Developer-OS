import { Injectable } from '@nestjs/common';
import { DatabaseType, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { ENVIRONMENT_REF, VAULT_REF } from '../servers/servers.service';
import { CreateDatabaseDto, DatabaseQueryDto, UpdateDatabaseDto } from './databases.dto';

/** The port each engine listens on unless told otherwise. */
const DEFAULT_PORT: Record<DatabaseType, number | null> = {
  POSTGRESQL: 5432,
  MONGODB: 27017,
  MYSQL: 3306,
  REDIS: 6379,
  SQLITE: null,
  OTHER: null,
};

/** How stale a backup has to be before it counts as a problem. */
const BACKUP_STALE_DAYS = 7;

@Injectable()
export class DatabasesService extends CrudService<
  CreateDatabaseDto,
  UpdateDatabaseDto,
  DatabaseQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'databaseInstance',
      entityType: EntityType.DATABASE,
      label: 'database',
      titleField: 'name',
      searchFields: ['name', 'host', 'databaseName', 'username', 'notes'],
      sortable: ['name', 'createdAt', 'updatedAt', 'type', 'sizeMb'],
      defaultSort: 'name',
      defaultOrder: 'asc',
      include: {
        environment: ENVIRONMENT_REF,
        server: { select: { id: true, name: true, status: true } },
        // The credential is a reference. Its name is safe to show; its
        // ciphertext is not in this shape at all.
        credential: VAULT_REF,
      },
      filter: (dto: DatabaseQueryDto) => ({
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
        ...(dto.serverId ? { serverId: dto.serverId } : {}),
      }),
      decorate: (row) => ({
        ...row,
        backupStatus: backupStatus(
          row.lastBackupAt as Date | null,
          row.backupSchedule as string | null,
        ),
        // A connection string with the password left as a placeholder — useful
        // to copy, impossible to leak.
        connectionHint: connectionHint(row),
      }),
      toCreate: (dto) => ({
        name: dto.name.trim(),
        type: dto.type,
        host: dto.host,
        port: dto.port ?? (dto.type ? DEFAULT_PORT[dto.type] : null),
        databaseName: dto.databaseName,
        username: dto.username,
        credentialId: dto.credentialId ?? null,
        version: dto.version,
        sizeMb: dto.sizeMb,
        backupSchedule: dto.backupSchedule,
        lastBackupAt: dto.lastBackupAt ? new Date(dto.lastBackupAt) : null,
        notes: dto.notes,
        environmentId: dto.environmentId ?? null,
        serverId: dto.serverId ?? null,
      }),
      toUpdate: (dto) => ({
        name: dto.name?.trim(),
        type: dto.type,
        host: dto.host,
        port: dto.port,
        databaseName: dto.databaseName,
        username: dto.username,
        credentialId: dto.credentialId === undefined ? undefined : (dto.credentialId ?? null),
        version: dto.version,
        sizeMb: dto.sizeMb,
        backupSchedule: dto.backupSchedule,
        lastBackupAt:
          dto.lastBackupAt === undefined
            ? undefined
            : dto.lastBackupAt
              ? new Date(dto.lastBackupAt)
              : null,
        notes: dto.notes,
        environmentId: dto.environmentId === undefined ? undefined : (dto.environmentId ?? null),
        serverId: dto.serverId === undefined ? undefined : (dto.serverId ?? null),
      }),
    });
  }

  /** Records that a backup happened — the dashboard reads this. */
  async markBackedUp(userId: string, id: string) {
    const row = await this.prisma.databaseInstance.updateMany({
      where: { id, userId },
      data: { lastBackupAt: new Date() },
    });
    if (row.count > 0) {
      await this.activity.record({
        userId,
        action: 'database.backed_up',
        entityType: EntityType.DATABASE,
        entityId: id,
        summary: 'Recorded a backup',
      });
    }
    return this.get(userId, id);
  }
}

function backupStatus(lastBackupAt: Date | null, schedule: string | null): string {
  if (!schedule) return 'none';
  if (!lastBackupAt) return 'never';
  const days = (Date.now() - lastBackupAt.getTime()) / 86_400_000;
  return days <= BACKUP_STALE_DAYS ? 'ok' : 'stale';
}

/**
 * A copyable connection string with the password left as `<password>`.
 * The real credential lives in the vault and is fetched separately, on purpose.
 */
function connectionHint(row: Record<string, unknown>): string | null {
  const type = row.type as DatabaseType;
  const host = (row.host as string | null) ?? 'localhost';
  const port = (row.port as number | null) ?? DEFAULT_PORT[type];
  const database = (row.databaseName as string | null) ?? '';
  const user = (row.username as string | null) ?? '<user>';

  switch (type) {
    case 'POSTGRESQL':
      return `postgresql://${user}:<password>@${host}:${port}/${database}`;
    case 'MYSQL':
      return `mysql://${user}:<password>@${host}:${port}/${database}`;
    case 'MONGODB':
      return `mongodb://${user}:<password>@${host}:${port}/${database}`;
    case 'REDIS':
      return `redis://:<password>@${host}:${port}`;
    default:
      return null;
  }
}
