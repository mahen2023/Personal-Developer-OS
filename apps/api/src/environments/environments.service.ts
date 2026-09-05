import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { found } from '../common/query';
import { VAULT_REF } from '../servers/servers.service';
import {
  CreateEnvironmentDto,
  EnvironmentQueryDto,
  UpsertVariableDto,
  UpdateEnvironmentDto,
} from './environments.dto';

/**
 * Environment variables (§18).
 *
 * A variable is either a literal or a pointer into the vault — never both, and
 * never a secret string in this table. That constraint is the entire point of
 * the module: `MONGO_URI → vault: basuki/prod/mongodb` is safe to look at on a
 * shared screen; the value is not.
 */
const VARIABLES = {
  orderBy: { key: 'asc' },
  include: { vaultItem: VAULT_REF },
} as const;

@Injectable()
export class EnvironmentsService extends CrudService<
  CreateEnvironmentDto,
  UpdateEnvironmentDto,
  EnvironmentQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'environment',
      entityType: EntityType.ENVIRONMENT,
      label: 'environment',
      titleField: 'name',
      searchFields: ['name', 'baseUrl', 'notes'],
      sortable: ['name', 'type', 'createdAt', 'updatedAt'],
      defaultSort: 'type',
      defaultOrder: 'asc',
      include: {
        variables: VARIABLES,
        _count: { select: { servers: true, databases: true, domains: true, deployments: true } },
      },
      filter: (dto: EnvironmentQueryDto) => (dto.type ? { type: dto.type } : {}),
      decorate: (row) => {
        const { _count, ...rest } = row as Record<string, unknown> & {
          _count?: Record<string, number>;
        };
        return { ...rest, counts: _count ?? {} };
      },
      toCreate: (dto) => ({
        name: dto.name.trim(),
        type: dto.type,
        baseUrl: dto.baseUrl,
        notes: dto.notes,
      }),
      toUpdate: (dto) => ({
        name: dto.name?.trim(),
        type: dto.type,
        baseUrl: dto.baseUrl,
        notes: dto.notes,
      }),
    });
  }

  /**
   * Creates or replaces one variable. Sending both a literal and a vault
   * reference is rejected rather than silently resolved — the ambiguity is the
   * bug, and guessing which one was meant would hide it.
   */
  async upsertVariable(userId: string, environmentId: string, dto: UpsertVariableDto) {
    found(
      await this.prisma.environment.findFirst({
        where: { id: environmentId, userId },
        select: { id: true },
      }),
      'environment',
    );

    if (dto.value && dto.vaultItemId) {
      throw new BadRequestException(
        'A variable is either a literal value or a vault reference, not both.',
      );
    }
    if (!dto.value && !dto.vaultItemId) {
      throw new BadRequestException('Give the variable a value, or point it at a vault item.');
    }

    if (dto.vaultItemId) {
      // Proves the vault item is this user's before storing the pointer.
      found(
        await this.prisma.vaultItem.findFirst({
          where: { id: dto.vaultItemId, userId },
          select: { id: true },
        }),
        'vault item',
      );
    }

    const key = dto.key.trim();
    await this.prisma.envVariable.upsert({
      where: { environmentId_key: { environmentId, key } },
      create: {
        environmentId,
        key,
        value: dto.vaultItemId ? null : dto.value,
        vaultItemId: dto.vaultItemId ?? null,
        isSecret: Boolean(dto.vaultItemId),
        description: dto.description,
      },
      update: {
        value: dto.vaultItemId ? null : dto.value,
        vaultItemId: dto.vaultItemId ?? null,
        isSecret: Boolean(dto.vaultItemId),
        description: dto.description,
      },
    });

    await this.activity.record({
      userId,
      action: 'environment.variable_set',
      entityType: EntityType.ENVIRONMENT,
      entityId: environmentId,
      // The key is recorded; the value never is, secret or not.
      summary: `Set ${key}`,
      meta: { key, isSecret: Boolean(dto.vaultItemId) },
    });
    return this.get(userId, environmentId);
  }

  async removeVariable(userId: string, environmentId: string, variableId: string) {
    found(
      await this.prisma.environment.findFirst({
        where: { id: environmentId, userId },
        select: { id: true },
      }),
      'environment',
    );
    await this.prisma.envVariable.deleteMany({ where: { id: variableId, environmentId } });
    return this.get(userId, environmentId);
  }

  /**
   * A `.env` skeleton: every key, with secrets left as a vault pointer rather
   * than a value. Safe to paste into a ticket; useless to an attacker.
   */
  async exportTemplate(userId: string, environmentId: string): Promise<string> {
    const environment = found(
      await this.prisma.environment.findFirst({
        where: { id: environmentId, userId },
        include: { variables: VARIABLES, project: { select: { name: true } } },
      }),
      'environment',
    );

    const lines = [
      `# ${environment.project?.name ?? 'Unfiled'} — ${environment.name}`,
      '# Secrets are shown as vault references. Fetch the values from the vault.',
      '',
    ];
    for (const variable of environment.variables) {
      if (variable.description) lines.push(`# ${variable.description}`);
      lines.push(
        variable.vaultItemId
          ? `${variable.key}=            # vault: ${variable.vaultItem?.name ?? variable.vaultItemId}`
          : `${variable.key}=${variable.value ?? ''}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}
