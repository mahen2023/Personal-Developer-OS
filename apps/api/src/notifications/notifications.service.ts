import { Injectable, Logger } from '@nestjs/common';
import { EntityType, NotificationKind, Prisma, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto, page } from '../common/dto/pagination.dto';
import { found } from '../common/query';
import { MailService } from './mail.service';

export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  severity?: Severity;
  title: string;
  body?: string;
  entityType?: EntityType;
  entityId?: string;
  dueAt?: Date | null;
  /**
   * Identity of the *fact*, not of the moment. The daily scan re-raises every
   * warning it still believes; the dedupe key is what stops that becoming a
   * hundred copies of "example.com expires soon" by the end of the quarter.
   */
  dedupeKey: string;
}

/** Which kinds a user has muted, and where the rest are delivered. */
export interface NotificationPreferences {
  email: boolean;
  browser: boolean;
  muted: NotificationKind[];
}

const DEFAULTS: NotificationPreferences = { email: false, browser: false, muted: [] };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Raises a notification, or leaves the existing one alone.
   *
   * Re-raising must not mark a read notification unread: if you have seen that
   * a certificate expires in 30 days, being told again tomorrow is noise. It
   * becomes worth surfacing again only when the severity rises, which is what
   * the escalation branch is for.
   */
  async raise(input: NotificationInput): Promise<boolean> {
    const preferences = await this.preferencesFor(input.userId);
    if (preferences.muted.includes(input.kind)) return false;

    const severity = input.severity ?? Severity.INFO;
    const existing = await this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
      select: { id: true, severity: true, readAt: true },
    });

    if (existing) {
      if (rank(severity) <= rank(existing.severity)) return false;
      // It got worse. Bring it back, unread, with the new wording.
      await this.prisma.notification.update({
        where: { id: existing.id },
        data: {
          severity,
          title: input.title,
          body: input.body ?? null,
          dueAt: input.dueAt ?? null,
          readAt: null,
          dismissedAt: null,
        },
      });
      await this.deliver(input, severity, preferences);
      return true;
    }

    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        severity,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dueAt: input.dueAt ?? null,
        dedupeKey: input.dedupeKey,
      },
    });
    await this.deliver(input, severity, preferences);
    return true;
  }

  /**
   * Declares `keep` to be the complete set of facts of this kind that are true
   * right now, and deletes every other notification of that kind.
   *
   * This is what keeps the list trustworthy. A renewed certificate's warning
   * disappears on the next scan, and so does the superseded 30-day warning once
   * the 7-day one exists. Read and dismissed rows go too: a notification is a
   * live claim about the world, not a record that it was once made. The record
   * is the activity feed.
   */
  async reconcile(userId: string, kind: NotificationKind, keep: string[]): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      // `notIn: []` matches nothing in SQL, so an empty `keep` — meaning
      // nothing of this kind is true any more — needs a value no key can have.
      where: { userId, kind, dedupeKey: { notIn: keep.length > 0 ? keep : ['-'] } },
    });
    return count;
  }

  async list(userId: string, dto: PaginationDto & { unread?: boolean }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      dismissedAt: null,
      ...(dto.unread ? { readAt: null } : {}),
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        // Worst first, then newest: a critical from Tuesday outranks an info
        // from this morning.
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null } }),
    ]);
    return { ...page(items, total, dto), unread };
  }

  async markRead(userId: string, id: string): Promise<void> {
    found(
      await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } }),
      'notification',
    );
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }

  /** Dismissing hides it for good; the scan will not raise the same key again. */
  async dismiss(userId: string, id: string): Promise<void> {
    found(
      await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } }),
      'notification',
    );
    await this.prisma.notification.update({
      where: { id },
      data: { dismissedAt: new Date(), readAt: new Date() },
    });
  }

  async preferencesFor(userId: string): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    const stored = (user?.settings as { notifications?: Partial<NotificationPreferences> } | null)
      ?.notifications;
    return {
      email: stored?.email ?? DEFAULTS.email,
      browser: stored?.browser ?? DEFAULTS.browser,
      muted: Array.isArray(stored?.muted) ? stored.muted : DEFAULTS.muted,
    };
  }

  /**
   * Out-of-app delivery. In-app is the row itself and always happens; email is
   * best-effort and opt-in. Browser notifications are raised by the client from
   * the unread list — the server has no push subscription and does not want one.
   */
  private async deliver(
    input: NotificationInput,
    severity: Severity,
    preferences: NotificationPreferences,
  ): Promise<void> {
    if (!preferences.email || severity === Severity.INFO) return;

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });
    if (!user) return;

    await this.mail
      .send({
        to: user.email,
        subject: `[Developer OS] ${input.title}`,
        text: `${input.title}\n\n${input.body ?? ''}\n\nSeen in Developer OS.`,
      })
      .catch((caught: Error) => this.logger.warn(`Email not sent: ${caught.message}`));
  }
}

const ORDER: Record<Severity, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };
const rank = (severity: Severity): number => ORDER[severity];
