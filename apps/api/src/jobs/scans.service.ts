import { Injectable, Logger } from '@nestjs/common';
import { NotificationKind, Severity, TaskStatus } from '@prisma/client';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IndexerService } from '../ai/indexer.service';
import { plural } from '../common/text';
import { daysUntil as daysLeft } from '../common/dates';

/**
 * The scans (§37, §38, §46).
 *
 * Each one answers the same shape of question — what will hurt soon, and does
 * the user already know? — and each is written to be run again tomorrow
 * without producing a second copy of yesterday's warning. That property lives
 * in the dedupe key, and `reconcile` is its other half: a warning whose cause
 * has gone is deleted rather than left to rot at the bottom of the list.
 *
 * Everything here is idempotent. Running a scan twice by hand is harmless,
 * which is what makes it safe to expose a "run now" button.
 */

/** How close is close enough to say something, and how loudly. */
const STEPS: { days: number; severity: Severity }[] = [
  { days: 7, severity: Severity.CRITICAL },
  { days: 30, severity: Severity.WARNING },
  { days: 60, severity: Severity.INFO },
];

export interface ScanReport {
  scan: string;
  checked: number;
  raised: number;
  cleared: number;
}

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly indexer: IndexerService,
  ) {}

  /** Every scan, for every active user. What the nightly job calls. */
  async runAll(): Promise<ScanReport[]> {
    const reports: ScanReport[] = [];
    for (const userId of await this.activeUserIds()) {
      reports.push(...(await this.runFor(userId)));
    }
    return reports;
  }

  /** Who the nightly jobs run for. Shared with the integration sync. */
  async activeUserIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async runFor(userId: string): Promise<ScanReport[]> {
    const scans: (() => Promise<ScanReport>)[] = [
      () => this.certificates(userId),
      () => this.domains(userId),
      () => this.tasks(userId),
      () => this.secretRotation(userId),
      () => this.documents(userId),
    ];

    const reports: ScanReport[] = [];
    for (const scan of scans) {
      try {
        reports.push(await scan());
      } catch (caught) {
        // One failing scan must not stop the rest — a broken certificate check
        // should never cost you the task reminders as well.
        this.logger.error(`A scan failed for ${userId}: ${(caught as Error).message}`);
      }
    }
    return reports;
  }

  /* ── expiry ─────────────────────────────────────────────────────────────── */

  private async certificates(userId: string): Promise<ScanReport> {
    const rows = await this.prisma.sslCertificate.findMany({
      where: { userId, expiresAt: { lte: horizon(STEPS[2].days) } },
      select: { id: true, commonName: true, expiresAt: true, autoRenew: true },
    });

    const keys: string[] = [];
    let raised = 0;
    for (const row of rows) {
      const step = stepFor(row.expiresAt);
      if (!step) continue;
      const key = `ssl:${row.id}:${step.days}`;
      keys.push(key);
      const left = daysLeft(row.expiresAt);
      if (
        await this.notifications.raise({
          userId,
          kind: NotificationKind.SSL_EXPIRY,
          severity: step.severity,
          title:
            left < 0
              ? `The certificate for ${row.commonName} has expired`
              : `${row.commonName} certificate expires ${inDays(left)}`,
          // Auto-renew is worth stating: it changes whether this needs a human.
          body: row.autoRenew
            ? 'Auto-renew is on for this certificate. Check that it actually renewed.'
            : 'Auto-renew is off. This one has to be renewed by hand.',
          entityType: EntityType.SSL_CERTIFICATE,
          entityId: row.id,
          dueAt: row.expiresAt,
          dedupeKey: key,
        })
      ) {
        raised += 1;
      }
    }

    const cleared = await this.notifications.reconcile(userId, NotificationKind.SSL_EXPIRY, keys);
    return { scan: 'certificates', checked: rows.length, raised, cleared };
  }

  private async domains(userId: string): Promise<ScanReport> {
    const rows = await this.prisma.domain.findMany({
      where: { userId, expiresAt: { lte: horizon(STEPS[2].days) } },
      select: { id: true, name: true, expiresAt: true, autoRenew: true },
    });

    const keys: string[] = [];
    let raised = 0;
    for (const row of rows) {
      if (!row.expiresAt) continue;
      const step = stepFor(row.expiresAt);
      if (!step) continue;
      const key = `domain:${row.id}:${step.days}`;
      keys.push(key);
      const left = daysLeft(row.expiresAt);
      if (
        await this.notifications.raise({
          userId,
          kind: NotificationKind.DOMAIN_EXPIRY,
          severity: step.severity,
          title:
            left < 0
              ? `The registration for ${row.name} has lapsed`
              : `${row.name} registration expires ${inDays(left)}`,
          body: row.autoRenew
            ? 'Auto-renew is on. Confirm the card on file is still valid.'
            : 'Auto-renew is off. Losing this domain would be permanent.',
          entityType: EntityType.DOMAIN,
          entityId: row.id,
          dueAt: row.expiresAt,
          dedupeKey: key,
        })
      ) {
        raised += 1;
      }
    }

    const cleared = await this.notifications.reconcile(
      userId,
      NotificationKind.DOMAIN_EXPIRY,
      keys,
    );
    return { scan: 'domains', checked: rows.length, raised, cleared };
  }

  /* ── work ───────────────────────────────────────────────────────────────── */

  private async tasks(userId: string): Promise<ScanReport> {
    const rows = await this.prisma.task.findMany({
      where: {
        userId,
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        dueDate: { not: null, lte: horizon(3) },
      },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
    });

    const overdueKeys: string[] = [];
    const dueKeys: string[] = [];
    let raised = 0;

    for (const row of rows) {
      if (!row.dueDate) continue;
      const left = daysLeft(row.dueDate);
      const overdue = left < 0;
      const key = `task:${row.id}:${overdue ? 'overdue' : 'due'}`;
      (overdue ? overdueKeys : dueKeys).push(key);

      if (
        await this.notifications.raise({
          userId,
          kind: overdue ? NotificationKind.TASK_OVERDUE : NotificationKind.TASK_DUE,
          severity: overdue ? Severity.WARNING : Severity.INFO,
          title: overdue
            ? `${row.title} was due ${plural(Math.abs(left), 'day')} ago`
            : `${row.title} is due ${inDays(left)}`,
          body: row.project?.name ?? undefined,
          entityType: EntityType.TASK,
          entityId: row.id,
          dueAt: row.dueDate,
          dedupeKey: key,
        })
      ) {
        raised += 1;
      }
    }

    const cleared =
      (await this.notifications.reconcile(userId, NotificationKind.TASK_DUE, dueKeys)) +
      (await this.notifications.reconcile(userId, NotificationKind.TASK_OVERDUE, overdueKeys));
    return { scan: 'tasks', checked: rows.length, raised, cleared };
  }

  /* ── secrets ────────────────────────────────────────────────────────────── */

  /**
   * Rotation reminders (§38). Reads only `rotateEveryD` and `lastRotatedAt` —
   * both stored in the clear precisely so this can run while the vault is
   * locked. The ciphertext is never touched, and no secret appears in the
   * notification (§43).
   */
  private async secretRotation(userId: string): Promise<ScanReport> {
    const rows = await this.prisma.vaultItem.findMany({
      where: { userId, rotateEveryD: { not: null } },
      select: {
        id: true,
        name: true,
        type: true,
        rotateEveryD: true,
        lastRotatedAt: true,
        createdAt: true,
      },
    });

    const keys: string[] = [];
    let raised = 0;
    for (const row of rows) {
      const since = row.lastRotatedAt ?? row.createdAt;
      const due = new Date(since.getTime() + (row.rotateEveryD ?? 0) * 86_400_000);
      const left = daysLeft(due);
      if (left > 14) continue;

      const key = `rotate:${row.id}:${left < 0 ? 'overdue' : 'soon'}`;
      keys.push(key);
      if (
        await this.notifications.raise({
          userId,
          kind: NotificationKind.SECRET_ROTATION,
          severity: left < 0 ? Severity.WARNING : Severity.INFO,
          title:
            left < 0
              ? `${row.name} was due for rotation ${plural(Math.abs(left), 'day')} ago`
              : `${row.name} is due for rotation ${inDays(left)}`,
          body: `Set to rotate every ${plural(row.rotateEveryD ?? 0, 'day')}. Last changed ${since.toISOString().slice(0, 10)}.`,
          entityType: EntityType.VAULT_ITEM,
          entityId: row.id,
          dueAt: due,
          dedupeKey: key,
        })
      ) {
        raised += 1;
      }
    }

    const cleared = await this.notifications.reconcile(
      userId,
      NotificationKind.SECRET_ROTATION,
      keys,
    );
    return { scan: 'secret rotation', checked: rows.length, raised, cleared };
  }

  /* ── housekeeping ───────────────────────────────────────────────────────── */

  /**
   * Reads text out of any document that arrived before extraction existed, and
   * indexes it. Silent by design — nobody wants a notification saying a PDF was
   * successfully read.
   */
  private async documents(userId: string): Promise<ScanReport> {
    const { read } = await this.indexer.extractDocuments(userId);
    if (read > 0) await this.indexer.reindex(userId, 'document');
    return { scan: 'documents', checked: read, raised: 0, cleared: 0 };
  }
}

/** "today", "tomorrow", "in 6 days" — never "in 1 days". */
const inDays = (left: number): string =>
  left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${plural(left, 'day')}`;

const horizon = (days: number): Date => new Date(Date.now() + days * 86_400_000);

/**
 * The tightest threshold this date has crossed. Returning the step — not just
 * a boolean — is what makes the dedupe key escalate: `ssl:id:30` and
 * `ssl:id:7` are different facts, so the 7-day warning arrives unread even if
 * the 30-day one was dismissed.
 */
function stepFor(when: Date): { days: number; severity: Severity } | null {
  const left = daysLeft(when);
  return STEPS.find((step) => left <= step.days) ?? null;
}
