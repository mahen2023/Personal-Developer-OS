import { EntityType, IssueStatus, Priority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pathFor } from '../search/search.service';
import { plural } from '../common/text';
import { daysUntil } from '../common/dates';

/**
 * Questions the database can answer exactly (§34).
 *
 * "How many open issues do I have?" has a correct answer, and a language model
 * is the wrong tool for producing it — it would paraphrase a retrieved passage
 * and be confidently out of date. These are ordinary queries, matched by
 * intent and run directly.
 *
 * Note what this is not: it does not generate SQL. Each intent is a query
 * written by hand, so a question can only ever run one of the statements in
 * this file (§26). The set is small on purpose; anything not here falls
 * through to retrieval, which is the honest outcome.
 */

export interface StructuredRow {
  title: string;
  detail?: string;
  /** ISO date this row hangs on, when it has one. */
  when?: string;
  href: string;
  /** How worried to look. */
  signal?: 'danger' | 'warning' | 'info' | 'neutral';
}

export interface StructuredAnswer {
  intent: string;
  headline: string;
  rows: StructuredRow[];
  /** Said plainly when the answer is "nothing", which is usually good news. */
  empty: string;
}

interface Intent {
  name: string;
  /** All of a group must appear; any one within a group will do. */
  triggers: RegExp[];
  run: (prisma: PrismaService, userId: string) => Promise<StructuredAnswer>;
}

const days = (count: number): Date => new Date(Date.now() + count * 86_400_000);

const INTENTS: Intent[] = [
  {
    name: 'expiring',
    triggers: [/\bexpir|renew|running out\b/i, /\bcert|ssl|domain|soon|next|what\b/i],
    run: async (prisma, userId) => {
      const horizon = days(60);
      const [certificates, domains] = await Promise.all([
        prisma.sslCertificate.findMany({
          where: { userId, expiresAt: { lte: horizon } },
          orderBy: { expiresAt: 'asc' },
          take: 15,
        }),
        prisma.domain.findMany({
          where: { userId, expiresAt: { lte: horizon } },
          orderBy: { expiresAt: 'asc' },
          take: 15,
        }),
      ]);

      const rows = [
        ...certificates.map((row) => ({
          title: row.commonName,
          detail: 'SSL certificate',
          when: row.expiresAt.toISOString(),
          href: pathFor(EntityType.SSL_CERTIFICATE, row.id),
          signal: severity(row.expiresAt),
        })),
        ...domains.map((row) => ({
          title: row.name,
          detail: 'Domain registration',
          when: row.expiresAt?.toISOString(),
          href: pathFor(EntityType.DOMAIN, row.id),
          signal: severity(row.expiresAt),
        })),
      ].sort((a, b) => (a.when ?? '').localeCompare(b.when ?? ''));

      return {
        intent: 'expiring',
        headline: `${plural(rows.length, 'thing')} expiring in the next 60 days`,
        rows,
        empty: 'Nothing expires in the next 60 days.',
      };
    },
  },

  {
    name: 'overdue',
    triggers: [/\boverdue|late|behind|due\b/i, /\btask|todo|work|what|anything\b/i],
    run: async (prisma, userId) => {
      const rows = await prisma.task.findMany({
        where: {
          userId,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          dueDate: { lte: days(7) },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
        include: { project: { select: { name: true } } },
      });

      return {
        intent: 'overdue',
        headline: `${plural(rows.length, 'task')} due within a week, or already late`,
        rows: rows.map((row) => ({
          title: row.title,
          detail: row.project?.name ?? 'No project',
          when: row.dueDate?.toISOString(),
          href: pathFor(EntityType.TASK, row.id),
          signal: row.dueDate && row.dueDate < new Date() ? 'danger' : 'warning',
        })),
        empty: 'Nothing is due in the next week.',
      };
    },
  },

  {
    name: 'open-issues',
    triggers: [
      /\bissue|bug|broken|failing\b/i,
      /\bopen|outstanding|how many|unresolved|current\b/i,
    ],
    run: async (prisma, userId) => {
      const rows = await prisma.issue.findMany({
        where: {
          userId,
          status: { in: [IssueStatus.OPEN, IssueStatus.INVESTIGATING, IssueStatus.BLOCKED] },
        },
        // Priority is declared low-to-high, so descending is most urgent first.
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        include: { project: { select: { name: true } } },
      });

      return {
        intent: 'open-issues',
        headline: `${plural(rows.length, 'issue')} still open`,
        rows: rows.map((row) => ({
          title: row.title,
          detail: `${row.priority.toLowerCase()} · ${row.project?.name ?? 'no project'}`,
          when: row.createdAt.toISOString(),
          href: pathFor(EntityType.ISSUE, row.id),
          signal:
            row.priority === Priority.URGENT || row.priority === Priority.HIGH ? 'danger' : 'info',
        })),
        empty: 'No open issues.',
      };
    },
  },

  {
    name: 'recent-deployments',
    triggers: [/\bdeploy|release|shipped?|ship\b/i, /\brecent|last|latest|when|history\b/i],
    run: async (prisma, userId) => {
      const rows = await prisma.deployment.findMany({
        where: { userId },
        orderBy: { deployedAt: 'desc' },
        take: 15,
        include: { project: { select: { name: true } }, environment: { select: { name: true } } },
      });

      return {
        intent: 'recent-deployments',
        headline: `The last ${plural(rows.length, 'deployment')}`,
        rows: rows.map((row) => ({
          title: `${row.project?.name ?? 'Unknown'} → ${row.environment?.name ?? 'unknown'}`,
          detail: `${row.status.toLowerCase()}${row.version ? ` · ${row.version}` : ''}`,
          when: row.deployedAt.toISOString(),
          href: pathFor(EntityType.DEPLOYMENT, row.id),
          signal: row.status === 'FAILED' ? 'danger' : 'neutral',
        })),
        empty: 'Nothing has been deployed yet.',
      };
    },
  },

  {
    name: 'active-projects',
    triggers: [/\bproject|working on|active\b/i, /\bwhat|which|list|current|active|my\b/i],
    run: async (prisma, userId) => {
      const rows = await prisma.project.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      return {
        intent: 'active-projects',
        headline: `${plural(rows.length, 'active project')}`,
        rows: rows.map((row) => ({
          title: row.name,
          detail: row.client ?? row.description?.slice(0, 80) ?? undefined,
          when: row.updatedAt.toISOString(),
          href: `/projects/${row.slug}`,
          signal: 'neutral' as const,
        })),
        empty: 'No projects are marked active.',
      };
    },
  },
];

function severity(when: Date | null): 'danger' | 'warning' | 'info' {
  if (!when) return 'info';
  const left = daysUntil(when);
  if (left <= 14) return 'danger';
  if (left <= 30) return 'warning';
  return 'info';
}

/**
 * Picks an intent, or nothing. Every trigger group must match, which keeps
 * "where did I write the note about certificate pinning" — a knowledge
 * question that happens to contain the word "certificate" — out of the
 * expiry query.
 */
export function routeStructured(question: string): Intent | null {
  return INTENTS.find((intent) => intent.triggers.every((rule) => rule.test(question))) ?? null;
}

export const structuredIntents = INTENTS.map((intent) => intent.name);
