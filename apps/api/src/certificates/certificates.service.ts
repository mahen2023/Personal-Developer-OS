import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { TagsService } from '../tags/tags.service';
import { LinksService } from '../links/links.service';
import { CrudService } from '../common/crud.service';
import { found } from '../common/query';
import { ENVIRONMENT_REF } from '../servers/servers.service';
import { expiry } from '../domains/domains.service';
import {
  CertificateQueryDto,
  CreateCertificateDto,
  RenewCertificateDto,
  UpdateCertificateDto,
} from './certificates.dto';

/** Let's Encrypt is 90 days; used as the default when renewing by hand. */
const DEFAULT_VALIDITY_DAYS = 90;

@Injectable()
export class CertificatesService extends CrudService<
  CreateCertificateDto,
  UpdateCertificateDto,
  CertificateQueryDto
> {
  constructor(
    prisma: PrismaService,
    activity: ActivityService,
    tags: TagsService,
    links: LinksService,
  ) {
    super(prisma, activity, tags, links, {
      model: 'sslCertificate',
      entityType: EntityType.SSL_CERTIFICATE,
      label: 'certificate',
      titleField: 'name',
      searchFields: ['commonName', 'issuer', 'notes'],
      sortable: ['expiresAt', 'commonName', 'createdAt', 'updatedAt'],
      // Soonest expiry first: this list exists to answer "what breaks next".
      defaultSort: 'expiresAt',
      defaultOrder: 'asc',
      include: {
        environment: ENVIRONMENT_REF,
        domain: { select: { id: true, name: true } },
      },
      filter: (dto: CertificateQueryDto) => ({
        ...(dto.environmentId ? { environmentId: dto.environmentId } : {}),
        ...(dto.domainId ? { domainId: dto.domainId } : {}),
        ...(dto.expiringWithin
          ? { expiresAt: { lte: new Date(Date.now() + dto.expiringWithin * 86_400_000) } }
          : {}),
      }),
      decorate: (row) => ({
        ...row,
        // `name` is what the shared base uses for activity lines; certificates
        // are identified by their common name.
        name: row.commonName,
        ...expiry(row.expiresAt as Date),
      }),
      toCreate: (dto) => ({
        commonName: dto.commonName.trim().toLowerCase(),
        issuer: dto.issuer,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: new Date(dto.expiresAt),
        autoRenew: dto.autoRenew ?? true,
        notes: dto.notes,
        domainId: dto.domainId ?? null,
        environmentId: dto.environmentId ?? null,
      }),
      toUpdate: (dto) => ({
        commonName: dto.commonName?.trim().toLowerCase(),
        issuer: dto.issuer,
        issuedAt:
          dto.issuedAt === undefined ? undefined : dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        autoRenew: dto.autoRenew,
        notes: dto.notes,
        domainId: dto.domainId === undefined ? undefined : (dto.domainId ?? null),
        environmentId: dto.environmentId === undefined ? undefined : (dto.environmentId ?? null),
      }),
    });
  }

  /**
   * Records a renewal. The app does not issue certificates — you renew it with
   * certbot or your provider, then tell this what the new dates are.
   */
  async renew(userId: string, id: string, dto: RenewCertificateDto) {
    const certificate = found(
      await this.prisma.sslCertificate.findFirst({ where: { id, userId } }),
      'certificate',
    );

    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : new Date();
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(issuedAt.getTime() + DEFAULT_VALIDITY_DAYS * 86_400_000);

    await this.prisma.sslCertificate.update({
      where: { id },
      data: { issuedAt, expiresAt },
    });

    await this.activity.record({
      userId,
      projectId: certificate.projectId,
      action: 'certificate.renewed',
      entityType: EntityType.SSL_CERTIFICATE,
      entityId: id,
      summary: `Renewed ${certificate.commonName} — valid until ${expiresAt.toISOString().slice(0, 10)}`,
    });
    return this.get(userId, id);
  }
}
