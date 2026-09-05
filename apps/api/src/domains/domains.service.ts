import { Injectable } from '@nestjs/common';
import { daysUntil } from '../common/dates';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { ENVIRONMENT_REF } from '../servers/servers.service';
import { CreateDomainDto, DomainQueryDto, UpdateDomainDto } from './domains.dto';

/**
 * Expiry, expressed the way the UI shows it (§20).
 *
 * Derived on every read rather than stored, so it cannot go stale in a row
 * nobody has touched — which is exactly the row that is about to expire.
 */
export function expiry(at: Date | string | null | undefined): {
  daysLeft: number | null;
  state: 'valid' | 'warning' | 'critical' | 'expired' | 'unknown';
} {
  if (!at) return { daysLeft: null, state: 'unknown' };
  const daysLeft = daysUntil(at);
  if (daysLeft < 0) return { daysLeft, state: 'expired' };
  if (daysLeft <= 7) return { daysLeft, state: 'critical' };
  if (daysLeft <= 14) return { daysLeft, state: 'warning' };
  return { daysLeft, state: 'valid' };
}

@Injectable()
export class DomainsService extends CrudService<CreateDomainDto, UpdateDomainDto, DomainQueryDto> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'domain',
      entityType: EntityType.DOMAIN,
      label: 'domain',
      titleField: 'name',
      searchFields: ['name', 'registrar', 'dnsProvider', 'notes'],
      sortable: ['name', 'expiresAt', 'createdAt', 'updatedAt'],
      defaultSort: 'name',
      defaultOrder: 'asc',
      include: {
        environment: ENVIRONMENT_REF,
        certificates: {
          orderBy: { expiresAt: 'asc' },
          select: { id: true, commonName: true, expiresAt: true, issuer: true, autoRenew: true },
        },
      },
      filter: (dto: DomainQueryDto) => ({
        ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
        ...(dto.registrar ? { registrar: dto.registrar } : {}),
        ...(dto.expiringWithin
          ? {
              expiresAt: {
                not: null,
                lte: new Date(Date.now() + dto.expiringWithin * 86_400_000),
              },
            }
          : {}),
      }),
      decorate: (row) => ({ ...row, ...expiry(row.expiresAt as Date | null) }),
      toCreate: (dto) => ({
        name: dto.name.trim().toLowerCase(),
        registrar: dto.registrar,
        dnsProvider: dto.dnsProvider,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        autoRenew: dto.autoRenew ?? false,
        notes: dto.notes,
        environmentId: dto.environmentId ?? null,
      }),
      toUpdate: (dto) => ({
        name: dto.name?.trim().toLowerCase(),
        registrar: dto.registrar,
        dnsProvider: dto.dnsProvider,
        expiresAt:
          dto.expiresAt === undefined ? undefined : dto.expiresAt ? new Date(dto.expiresAt) : null,
        autoRenew: dto.autoRenew,
        notes: dto.notes,
        environmentId: dto.environmentId === undefined ? undefined : (dto.environmentId ?? null),
      }),
    });
  }
}
