import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { cleanList } from '../common/query';
import { CreateServerDto, ServerQueryDto, UpdateServerDto } from './servers.dto';

/** Environment and vault stubs every infrastructure row carries. */
export const ENVIRONMENT_REF = {
  select: { id: true, name: true, type: true },
} as const;

/** Name only — never the ciphertext, and never anything derived from it. */
export const VAULT_REF = { select: { id: true, name: true, type: true } } as const;

@Injectable()
export class ServersService extends CrudService<CreateServerDto, UpdateServerDto, ServerQueryDto> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'server',
      entityType: EntityType.SERVER,
      label: 'server',
      titleField: 'name',
      searchFields: ['name', 'hostname', 'ipAddress', 'os', 'region', 'notes'],
      sortable: ['name', 'createdAt', 'updatedAt', 'status', 'provider'],
      defaultSort: 'name',
      defaultOrder: 'asc',
      include: {
        environment: ENVIRONMENT_REF,
        sshKey: VAULT_REF,
        databases: { select: { id: true, name: true, type: true } },
      },
      filter: (dto: ServerQueryDto) => ({
        ...(dto.provider ? { provider: dto.provider } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
      }),
      toCreate: (dto) => ({
        name: dto.name.trim(),
        provider: dto.provider,
        ipAddress: dto.ipAddress,
        hostname: dto.hostname,
        os: dto.os,
        cpuCores: dto.cpuCores,
        ramGb: dto.ramGb,
        diskGb: dto.diskGb,
        region: dto.region,
        sshUsername: dto.sshUsername,
        sshPort: dto.sshPort,
        // A vault reference, never a key. See docs/SECURITY.md.
        sshKeyId: dto.sshKeyId ?? null,
        services: cleanList(dto.services),
        status: dto.status,
        notes: dto.notes,
        environmentId: dto.environmentId ?? null,
      }),
      toUpdate: (dto) => ({
        name: dto.name?.trim(),
        provider: dto.provider,
        ipAddress: dto.ipAddress,
        hostname: dto.hostname,
        os: dto.os,
        cpuCores: dto.cpuCores,
        ramGb: dto.ramGb,
        diskGb: dto.diskGb,
        region: dto.region,
        sshUsername: dto.sshUsername,
        sshPort: dto.sshPort,
        sshKeyId: dto.sshKeyId === undefined ? undefined : (dto.sshKeyId ?? null),
        services: dto.services ? cleanList(dto.services) : undefined,
        status: dto.status,
        notes: dto.notes,
        environmentId: dto.environmentId === undefined ? undefined : (dto.environmentId ?? null),
      }),
    });
  }

  /**
   * The SSH command for this host, assembled from what is recorded.
   *
   * Returned as text for the user to run themselves — the application never
   * opens a connection or executes anything (§26).
   */
  async sshCommand(userId: string, id: string): Promise<{ command: string; note?: string }> {
    const server = (await this.get(userId, id)) as unknown as {
      sshUsername: string | null;
      sshPort: number | null;
      ipAddress: string | null;
      hostname: string | null;
      sshKey: { name: string } | null;
    };

    const host = server.hostname || server.ipAddress;
    if (!host) return { command: '', note: 'No hostname or IP address recorded for this server.' };

    const parts = ['ssh'];
    if (server.sshPort && server.sshPort !== 22) parts.push('-p', String(server.sshPort));
    parts.push(server.sshUsername ? `${server.sshUsername}@${host}` : host);

    return {
      command: parts.join(' '),
      note: server.sshKey
        ? `Uses the key stored in the vault as "${server.sshKey.name}".`
        : undefined,
    };
  }
}
