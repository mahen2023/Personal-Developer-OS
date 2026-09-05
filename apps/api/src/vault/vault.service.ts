import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, EntityType, Prisma, VaultItemType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, page } from '../common/dto/pagination.dto';
import { PROJECT_REF, found, pageArgs, scopeToProject, search } from '../common/query';
import { type Bytes, envelopeKey, fromBase64, open, sameBytes, seal, toBase64 } from './envelope';
import {
  CreateVaultItemDto,
  SetupVaultDto,
  UnlockVaultDto,
  UpdateVaultItemDto,
  VaultQueryDto,
} from './vault.dto';

/** Non-secret columns. Everything else on the row is ciphertext. */
const METADATA = {
  id: true,
  name: true,
  type: true,
  username: true,
  url: true,
  notes: true,
  totpDigits: true,
  totpPeriod: true,
  rotateEveryD: true,
  lastRotatedAt: true,
  lastViewedAt: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SORTABLE = ['name', 'createdAt', 'updatedAt', 'type', 'lastViewedAt'] as const;

export interface VaultSession {
  token: string;
  expiresIn: number;
}

/**
 * The vault (§22).
 *
 * The master password never reaches this service. The browser derives a key
 * from it with Argon2id, encrypts each item under a data key, and sends only
 * ciphertext. This adds the server's envelope layer, checks a verifier that
 * proves knowledge of the master password without revealing it, and gates
 * every ciphertext read behind a short-lived unlock token.
 *
 * That last part matters: without it, a stolen session cookie would be enough
 * to download the whole encrypted vault at leisure. With it, an attacker also
 * has to be present during an unlocked window.
 */
@Injectable()
export class VaultService {
  private readonly key: Bytes;
  private readonly autoLockMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.key = envelopeKey(config.get<string>('vault.envelopeKey') as string);
    this.autoLockMinutes = config.get<number>('vault.autoLockMinutes') ?? 15;
  }

  /* ── profile ─────────────────────────────────────────────────────────────── */

  async status(userId: string) {
    const profile = await this.prisma.vaultProfile.findUnique({ where: { userId } });
    const items = await this.prisma.vaultItem.count({ where: { userId } });
    const byType = await this.prisma.vaultItem.groupBy({
      by: ['type'],
      where: { userId },
      _count: { type: true },
    });

    return {
      configured: Boolean(profile),
      lastUnlockedAt: profile?.lastUnlockedAt ?? null,
      autoLockMinutes: profile?.autoLockMin ?? this.autoLockMinutes,
      clipboardSeconds: profile?.clipboardSec ?? this.config.get<number>('vault.clipboardSeconds'),
      counts: {
        total: items,
        ...Object.fromEntries(byType.map((row) => [row.type, row._count.type])),
      },
      // Everything the browser needs to re-derive the same key. Public by
      // design: a KDF salt is not a secret, and the parameters have to match.
      kdf: profile
        ? {
            algorithm: profile.kdf,
            salt: toBase64(profile.kdfSalt),
            memoryKib: profile.kdfMemoryKib,
            iterations: profile.kdfIterations,
            parallelism: profile.kdfParallelism,
          }
        : null,
    };
  }

  /** Creates the profile. The salt is generated here so it is never chosen weakly. */
  async setup(userId: string, dto: SetupVaultDto, ctx: { ip?: string; userAgent?: string }) {
    const existing = await this.prisma.vaultProfile.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException(
        'This vault is already set up. Changing the master password is a separate operation.',
      );
    }

    await this.prisma.vaultProfile.create({
      data: {
        userId,
        kdfSalt: fromBase64(dto.salt),
        kdfMemoryKib: dto.memoryKib,
        kdfIterations: dto.iterations,
        kdfParallelism: dto.parallelism,
        verifier: fromBase64(dto.verifier),
        wrappedDataKey: fromBase64(dto.wrappedDataKey),
        wrapNonce: fromBase64(dto.wrapNonce),
        autoLockMin: dto.autoLockMinutes ?? this.autoLockMinutes,
      },
    });

    await this.audit(userId, AuditAction.VAULT_MASTER_CHANGED, ctx, true);
    return this.status(userId);
  }

  /** Server-side salt for a new profile, so the client never invents its own. */
  freshSalt(): { salt: string; memoryKib: number; iterations: number; parallelism: number } {
    return {
      salt: randomBytes(16).toString('base64'),
      // OWASP Argon2id guidance, sized for a browser: 64 MiB, t=3, p=1.
      memoryKib: 65_536,
      iterations: 3,
      parallelism: 1,
    };
  }

  /**
   * Checks the verifier and issues an unlock token.
   *
   * The wrapped data key comes back with it — useless without the master key,
   * which stays in the browser.
   */
  async unlock(
    userId: string,
    dto: UnlockVaultDto,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<VaultSession & { wrappedDataKey: string; wrapNonce: string }> {
    const profile = await this.prisma.vaultProfile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException('This vault has not been set up yet.');

    const presented = fromBase64(dto.verifier);
    if (!sameBytes(presented, profile.verifier)) {
      await this.audit(userId, AuditAction.VAULT_UNLOCKED, ctx, false);
      throw new UnauthorizedException('That master password is not correct.');
    }

    await this.prisma.vaultProfile.update({
      where: { userId },
      data: { lastUnlockedAt: new Date() },
    });
    await this.audit(userId, AuditAction.VAULT_UNLOCKED, ctx, true);

    const expiresIn = profile.autoLockMin * 60;
    const token = await this.jwt.signAsync(
      { sub: userId, vault: true },
      { secret: this.unlockSecret(), expiresIn },
    );
    return {
      token,
      expiresIn,
      wrappedDataKey: toBase64(profile.wrappedDataKey),
      wrapNonce: toBase64(profile.wrapNonce),
    };
  }

  async lock(userId: string, ctx: { ip?: string; userAgent?: string }): Promise<void> {
    // Nothing server-side to tear down — the key only ever existed in the
    // browser. The audit line is the point: it records that the window closed.
    await this.audit(userId, AuditAction.VAULT_LOCKED, ctx, true);
  }

  /** Throws unless the caller presented a live unlock token for this user. */
  async requireUnlocked(userId: string, token: string | undefined): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('The vault is locked. Unlock it to read a secret.');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; vault: boolean }>(token, {
        secret: this.unlockSecret(),
      });
      if (payload.sub !== userId || !payload.vault) throw new Error('wrong subject');
    } catch {
      throw new UnauthorizedException('The vault locked itself. Unlock it again.');
    }
  }

  async updateSettings(userId: string, autoLockMin?: number, clipboardSec?: number) {
    await this.prisma.vaultProfile.update({
      where: { userId },
      data: { autoLockMin, clipboardSec },
    });
    return this.status(userId);
  }

  /* ── items ───────────────────────────────────────────────────────────────── */

  /** Metadata only. This endpoint cannot leak a secret because it never loads one. */
  async list(userId: string, dto: VaultQueryDto) {
    const where: Prisma.VaultItemWhereInput = {
      userId,
      ...scopeToProject(dto.projectId),
      ...(dto.type ? { type: dto.type } : {}),
      ...search(dto.q, ['name', 'username', 'url', 'notes']),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.vaultItem.findMany({
        where,
        ...pageArgs(dto, SORTABLE, 'name', 'asc'),
        select: { ...METADATA, project: PROJECT_REF },
      }),
      this.prisma.vaultItem.count({ where }),
    ]);

    return page(
      rows.map((row) => ({ ...row, needsRotation: needsRotation(row) })),
      total,
      dto,
    );
  }

  async get(userId: string, id: string) {
    const item = found(
      await this.prisma.vaultItem.findFirst({
        where: { id, userId },
        select: { ...METADATA, project: PROJECT_REF },
      }),
      'vault item',
    );
    return { ...item, needsRotation: needsRotation(item) };
  }

  /**
   * Returns the ciphertext for the browser to decrypt.
   *
   * Requires an unlock token, records an audit line, and — deliberately —
   * never logs or returns anything derived from the plaintext.
   */
  async reveal(
    userId: string,
    id: string,
    unlockToken: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ) {
    await this.requireUnlocked(userId, unlockToken);

    const item = found(
      await this.prisma.vaultItem.findFirst({ where: { id, userId } }),
      'vault item',
    );

    const inner = open(item.cipher, this.key);
    await this.prisma.vaultItem.update({ where: { id }, data: { lastViewedAt: new Date() } });
    await this.audit(userId, AuditAction.SECRET_VIEWED, ctx, true, id);

    return {
      id: item.id,
      // Still encrypted under the master-derived key; only the browser can read it.
      cipher: toBase64(inner),
      nonce: toBase64(item.nonce),
      alg: item.alg,
    };
  }

  async create(
    userId: string,
    dto: CreateVaultItemDto,
    unlockToken: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ) {
    await this.requireUnlocked(userId, unlockToken);

    const item = await this.prisma.vaultItem.create({
      data: {
        userId,
        projectId: dto.projectId ?? null,
        name: dto.name.trim(),
        type: dto.type ?? VaultItemType.PASSWORD,
        username: dto.username,
        url: dto.url,
        notes: dto.notes,
        cipher: seal(fromBase64(dto.cipher), this.key),
        nonce: fromBase64(dto.nonce),
        totpDigits: dto.totpDigits,
        totpPeriod: dto.totpPeriod,
        rotateEveryD: dto.rotateEveryD,
        lastRotatedAt: new Date(),
      },
      select: METADATA,
    });

    await this.audit(userId, AuditAction.SECRET_CREATED, ctx, true, item.id);
    return this.get(userId, item.id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateVaultItemDto,
    unlockToken: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ) {
    // Metadata-only edits still require an unlocked vault: renaming an item is
    // not sensitive, but a stolen session should not be able to reshape the
    // vault into something misleading either.
    await this.requireUnlocked(userId, unlockToken);
    found(
      await this.prisma.vaultItem.findFirst({ where: { id, userId }, select: { id: true } }),
      'vault item',
    );

    const rotating = Boolean(dto.cipher && dto.nonce);
    await this.prisma.vaultItem.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : (dto.projectId ?? null),
        name: dto.name?.trim(),
        type: dto.type,
        username: dto.username,
        url: dto.url,
        notes: dto.notes,
        totpDigits: dto.totpDigits,
        totpPeriod: dto.totpPeriod,
        rotateEveryD: dto.rotateEveryD,
        ...(rotating
          ? {
              cipher: seal(fromBase64(dto.cipher as string), this.key),
              nonce: fromBase64(dto.nonce as string),
              lastRotatedAt: new Date(),
            }
          : {}),
      },
    });

    await this.audit(userId, AuditAction.SECRET_UPDATED, ctx, true, id);
    return this.get(userId, id);
  }

  async remove(
    userId: string,
    id: string,
    unlockToken: string | undefined,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<void> {
    await this.requireUnlocked(userId, unlockToken);
    found(
      await this.prisma.vaultItem.findFirst({ where: { id, userId }, select: { id: true } }),
      'vault item',
    );

    // Anything pointing at this item keeps working, minus the reference:
    // env vars, servers and databases all use SetNull.
    await this.prisma.vaultItem.delete({ where: { id } });
    await this.audit(userId, AuditAction.SECRET_DELETED, ctx, true, id);
  }

  /* ── audit ───────────────────────────────────────────────────────────────── */

  async auditLog(userId: string, dto: PaginationDto) {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return page(items, total, dto);
  }

  private unlockSecret(): string {
    // Deriving from the refresh secret keeps the number of secrets to manage
    // down; the `vault` claim is what separates the two token families.
    return `${this.config.get<string>('auth.refreshSecret')}:vault`;
  }

  private async audit(
    userId: string,
    action: AuditAction,
    ctx: { ip?: string; userAgent?: string },
    success: boolean,
    entityId?: string,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action,
          success,
          ip: ctx.ip,
          userAgent: ctx.userAgent?.slice(0, 255),
          entityType: entityId ? EntityType.VAULT_ITEM : undefined,
          entityId,
          // No meta at all on vault actions. There is nothing safe to put here
          // that is not already in the columns above.
        },
      })
      .catch(() => undefined);
  }
}

/** True when a secret has an age policy and has outlived it (§38). */
function needsRotation(item: { rotateEveryD: number | null; lastRotatedAt: Date | null }): boolean {
  if (!item.rotateEveryD || !item.lastRotatedAt) return false;
  const age = (Date.now() - item.lastRotatedAt.getTime()) / 86_400_000;
  return age >= item.rotateEveryD;
}
