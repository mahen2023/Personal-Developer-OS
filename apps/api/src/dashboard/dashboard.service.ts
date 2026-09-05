import { Injectable } from '@nestjs/common';
import { daysUntil } from '../common/dates';
import { EntityType, Severity, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** How far ahead the attention centre looks for expiries and deadlines. */
const HORIZON_DAYS = 45;

export interface AttentionItem {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  daysLeft: number | null;
  entityType: EntityType;
  entityId: string;
}

/**
 * Answers the dashboard's one question — "what do I need to know today?" (§9).
 * Everything is derived on read: there is no denormalised counter to drift.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string) {
    const [counts, attention, recent] = await Promise.all([
      this.counts(userId),
      this.attention(userId),
      this.recentWork(userId),
    ]);
    return { counts, attention, recent };
  }

  private async counts(userId: string) {
    const where = { userId };
    const [
      activeProjects,
      totalProjects,
      repositories,
      servers,
      databases,
      domains,
      openTasks,
      overdueTasks,
      solutions,
      notes,
      vaultItems,
      deployments,
    ] = await this.prisma.$transaction([
      this.prisma.project.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.project.count({ where }),
      this.prisma.repository.count({ where }),
      this.prisma.server.count({ where }),
      this.prisma.databaseInstance.count({ where }),
      this.prisma.domain.count({ where }),
      this.prisma.task.count({
        where: {
          userId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED] },
        },
      }),
      this.prisma.task.count({
        where: {
          userId,
          dueDate: { lt: new Date() },
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
      }),
      this.prisma.solution.count({ where }),
      this.prisma.note.count({ where }),
      this.prisma.vaultItem.count({ where }),
      this.prisma.deployment.count({ where }),
    ]);

    return {
      activeProjects,
      totalProjects,
      repositories,
      servers,
      databases,
      domains,
      openTasks,
      overdueTasks,
      solutions,
      notes,
      vaultItems,
      deployments,
    };
  }

  /** Expiring certs, expiring domains, overdue and imminent tasks, deadlines. */
  private async attention(userId: string): Promise<AttentionItem[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

    const [certs, domains, tasks, projects] = await this.prisma.$transaction([
      this.prisma.sslCertificate.findMany({
        where: { userId, expiresAt: { lte: horizon } },
        orderBy: { expiresAt: 'asc' },
        take: 10,
        select: { id: true, commonName: true, expiresAt: true },
      }),
      this.prisma.domain.findMany({
        where: { userId, expiresAt: { lte: horizon, not: null } },
        orderBy: { expiresAt: 'asc' },
        take: 10,
        select: { id: true, name: true, expiresAt: true, autoRenew: true },
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          dueDate: { lte: horizon, not: null },
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
        select: { id: true, title: true, dueDate: true },
      }),
      this.prisma.project.findMany({
        where: { userId, status: 'ACTIVE', targetDate: { lte: horizon, not: null } },
        orderBy: { targetDate: 'asc' },
        take: 5,
        select: { id: true, name: true, targetDate: true },
      }),
    ]);

    const items: AttentionItem[] = [
      ...certs.map((c) =>
        this.item(
          'SSL_EXPIRY',
          c.id,
          EntityType.SSL_CERTIFICATE,
          c.commonName,
          c.expiresAt,
          'certificate',
        ),
      ),
      ...domains.map((d) =>
        this.item(
          'DOMAIN_EXPIRY',
          d.id,
          EntityType.DOMAIN,
          d.name,
          d.expiresAt,
          d.autoRenew ? 'auto-renew on' : 'auto-renew off',
        ),
      ),
      ...tasks.map((t) => this.item('TASK_DUE', t.id, EntityType.TASK, t.title, t.dueDate, 'task')),
      ...projects.map((p) =>
        this.item('PROJECT_DEADLINE', p.id, EntityType.PROJECT, p.name, p.targetDate, 'deadline'),
      ),
    ];

    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    return items.sort(
      (a, b) => rank[a.severity] - rank[b.severity] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0),
    );
  }

  private item(
    kind: string,
    id: string,
    entityType: EntityType,
    title: string,
    at: Date | null,
    detail: string,
  ): AttentionItem {
    const daysLeft = at ? daysUntil(at) : null;
    // Thresholds map to the three states the ExpiryIndicator renders (§20).
    const severity =
      daysLeft === null || daysLeft > 14
        ? Severity.INFO
        : daysLeft <= 7
          ? Severity.CRITICAL
          : Severity.WARNING;
    return { id, kind, severity, title, detail, daysLeft, entityType, entityId: id };
  }

  private async recentWork(userId: string) {
    const [projects, notes, solutions, deployments] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, name: true, slug: true, status: true, color: true, updatedAt: true },
      }),
      this.prisma.note.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, type: true, updatedAt: true },
      }),
      this.prisma.solution.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true },
      }),
      this.prisma.deployment.findMany({
        where: { userId },
        orderBy: { deployedAt: 'desc' },
        take: 5,
        select: { id: true, version: true, status: true, deployedAt: true },
      }),
    ]);
    return { projects, notes, solutions, deployments };
  }
}
