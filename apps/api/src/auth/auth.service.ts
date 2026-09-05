import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). Deliberately the
 * same shape as the vault KDF, but a separate constant: raising vault cost is
 * cheap (one unlock per session) while raising login cost is not.
 */
const PASSWORD_HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    email: string,
    name: string,
    password: string,
    ctx: RequestContext,
  ): Promise<TokenPair & { user: { id: string; email: string; name: string } }> {
    if (!this.config.get<boolean>('auth.allowRegistration')) {
      const existing = await this.prisma.user.count();
      // Registration is closed, but an empty instance must still let its owner in.
      if (existing > 0) {
        throw new ForbiddenException('Registration is closed on this instance.');
      }
    }

    const normalized = email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (taken) throw new ForbiddenException('That email is already registered.');

    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name: name.trim(),
        passwordHash: await argon2.hash(password, PASSWORD_HASH_OPTIONS),
      },
      select: { id: true, email: true, name: true },
    });

    const tokens = await this.issueSession(user.id, user.email, ctx);
    await this.audit(user.id, AuditAction.LOGIN, ctx, true);
    return { ...tokens, user };
  }

  async login(email: string, password: string, ctx: RequestContext): Promise<TokenPair> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });

    // Always run a verification so a missing account and a wrong password take
    // comparable time and cannot be told apart by timing.
    const hash = user?.passwordHash ?? (await this.dummyHash());
    const valid = await argon2.verify(hash, password).catch(() => false);

    if (!user || !valid || !user.isActive) {
      await this.audit(user?.id ?? null, AuditAction.LOGIN_FAILED, ctx, false);
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const tokens = await this.issueSession(user.id, user.email, ctx);
    await this.audit(user.id, AuditAction.LOGIN, ctx, true);
    return tokens;
  }

  /**
   * Rotating refresh: the presented token is deleted as part of issuing the
   * next one, so a replayed token finds no session and fails.
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    let payload: { sub: string; email: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('auth.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.issueSession(payload.sub, payload.email, ctx);
  }

  async logout(
    refreshToken: string | undefined,
    userId: string,
    ctx: RequestContext,
  ): Promise<void> {
    if (refreshToken) {
      await this.prisma.session
        .delete({ where: { tokenHash: hashToken(refreshToken) } })
        .catch(() => undefined);
    }
    await this.audit(userId, AuditAction.LOGOUT, ctx, true);
  }

  /** Revokes every session, including the caller's. Used by "sign out everywhere". */
  async logoutAll(userId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.audit(userId, AuditAction.SESSION_REVOKED, ctx, true);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, lastUsedAt: true, createdAt: true },
    });
    return sessions.map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
    await this.audit(userId, AuditAction.SESSION_REVOKED, ctx, true, sessionId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!valid) {
      await this.audit(userId, AuditAction.PASSWORD_CHANGED, ctx, false);
      throw new UnauthorizedException('Current password is incorrect.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(newPassword, PASSWORD_HASH_OPTIONS) },
      }),
      // Changing the password invalidates every session — otherwise a stolen
      // refresh token survives the very event meant to kill it.
      this.prisma.session.deleteMany({ where: { userId } }),
    ]);
    await this.audit(userId, AuditAction.PASSWORD_CHANGED, ctx, true);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async issueSession(
    userId: string,
    email: string,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    const sessionId = randomBytes(16).toString('hex');
    const claims = { sub: userId, email, sid: sessionId };

    // Durations are converted to seconds here rather than handed to jsonwebtoken
    // as strings, so the TTL the cookie uses and the TTL the token carries come
    // from one parse and cannot drift apart.
    const accessSec = Math.floor(
      parseDuration(this.config.get<string>('auth.accessTtl') ?? '15m') / 1000,
    );
    const refreshSec = Math.floor(
      parseDuration(this.config.get<string>('auth.refreshTtl') ?? '30d') / 1000,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(claims, {
        secret: this.config.get<string>('auth.accessSecret'),
        expiresIn: accessSec,
      }),
      this.jwt.signAsync(
        { ...claims, jti: randomBytes(16).toString('hex') },
        { secret: this.config.get<string>('auth.refreshSecret'), expiresIn: refreshSec },
      ),
    ]);

    await this.prisma.session.create({
      data: {
        id: sessionIdToUuid(sessionId),
        userId,
        tokenHash: hashToken(refreshToken),
        userAgent: ctx.userAgent?.slice(0, 255),
        ip: ctx.ip,
        expiresAt: new Date(Date.now() + refreshSec * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessSec };
  }

  private async dummyHash(): Promise<string> {
    // Cached across calls would be faster, but a per-call hash of a constant
    // keeps the timing profile closest to the real path.
    return argon2.hash('no-such-user', PASSWORD_HASH_OPTIONS);
  }

  private async audit(
    userId: string | null,
    action: AuditAction,
    ctx: RequestContext,
    success: boolean,
    entityId?: string,
  ): Promise<void> {
    const data: Prisma.AuditLogCreateInput = {
      action,
      success,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 255),
      entityId,
      ...(userId ? { user: { connect: { id: userId } } } : {}),
    };
    await this.prisma.auditLog.create({ data }).catch(() => undefined);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare, exported for the vault verifier check in Phase 5. */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `15m`, `30d`, `12h`, `45s` -> milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported duration: ${value}`);
  const amount = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return amount * unit;
}

/** Session ids are UUID columns; the JWT carries a 32-char hex. */
function sessionIdToUuid(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
