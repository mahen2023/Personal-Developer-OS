import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Taking your data out (§51).
 *
 * The point of a self-hosted tool is that leaving is possible, so this is
 * written to be read by something else: JSON for a machine, CSV for a
 * spreadsheet, Markdown for a human or another notes app.
 *
 * Vault secrets are never here. Not by default, not behind a confirmation:
 * the server cannot decrypt them — only the browser holding the master key
 * can — so an export of readable passwords is something this design makes
 * impossible rather than merely discouraged. Vault *metadata* (names, types,
 * usernames) is included so an export still tells you what you had.
 */

export type ExportFormat = 'json' | 'csv' | 'markdown';

interface Source {
  delegate: string;
  /** Columns exported, in this order. The first is the title. */
  fields: readonly string[];
  /** Rendered as prose in Markdown, in this order. */
  prose?: readonly string[];
  /** Heading for the section, when title-casing the key would mangle it. */
  label?: string;
  orderBy?: string;
}

const SOURCES: Record<string, Source> = {
  projects: {
    delegate: 'project',
    fields: ['name', 'slug', 'status', 'priority', 'client', 'techStack', 'description'],
    prose: ['description'],
    orderBy: 'name',
  },
  notes: {
    delegate: 'note',
    fields: ['title', 'type', 'isPinned', 'createdAt', 'updatedAt'],
    prose: ['content'],
  },
  tasks: {
    delegate: 'task',
    fields: ['title', 'status', 'priority', 'dueDate', 'assignee', 'completedAt'],
    prose: ['description'],
  },
  issues: {
    delegate: 'issue',
    fields: ['title', 'status', 'priority', 'errorMessage', 'resolvedAt'],
    prose: ['description'],
  },
  solutions: {
    delegate: 'solution',
    fields: ['title', 'environment', 'errorMessage', 'useCount', 'updatedAt'],
    prose: ['problem', 'rootCause', 'solution'],
  },
  snippets: {
    delegate: 'snippet',
    fields: ['title', 'language', 'useCount', 'updatedAt'],
    prose: ['description', 'code'],
  },
  commands: {
    delegate: 'command',
    fields: ['title', 'command', 'category', 'isDangerous', 'useCount'],
    prose: ['description'],
  },
  adrs: {
    delegate: 'adr',
    label: 'ADRs',
    // Title first: the first field becomes the heading of each record, and a
    // Markdown file full of `## 7` is not a document anyone can read.
    fields: ['title', 'number', 'status', 'decidedAt'],
    prose: ['context', 'decision', 'consequences'],
    orderBy: 'number',
  },
  meetings: {
    delegate: 'meeting',
    fields: ['title', 'meetingDate', 'participants'],
    prose: ['discussion', 'decisions'],
    orderBy: 'meetingDate',
  },
  bookmarks: { delegate: 'bookmark', fields: ['title', 'url', 'category'], prose: ['description'] },
  ideas: { delegate: 'idea', fields: ['title', 'status', 'priority'], prose: ['description'] },
  learning: {
    delegate: 'learningItem',
    fields: ['title', 'type', 'status', 'progress', 'url'],
    prose: ['notes'],
  },
  servers: {
    delegate: 'server',
    fields: ['name', 'hostname', 'ipAddress', 'provider', 'os', 'status'],
    prose: ['notes'],
  },
  databases: {
    delegate: 'databaseInstance',
    fields: ['name', 'engine', 'version', 'host', 'port', 'environment'],
    prose: ['notes'],
  },
  domains: {
    delegate: 'domain',
    fields: ['name', 'registrar', 'expiresAt', 'autoRenew', 'dnsProvider'],
    prose: ['notes'],
  },
  certificates: {
    delegate: 'sslCertificate',
    fields: ['commonName', 'issuer', 'issuedAt', 'expiresAt', 'autoRenew'],
    prose: ['notes'],
  },
  deployments: {
    delegate: 'deployment',
    fields: ['version', 'status', 'deployedAt', 'commitSha', 'deployedBy'],
    prose: ['notes'],
  },
  repositories: {
    delegate: 'repository',
    fields: ['name', 'url', 'provider', 'defaultBranch', 'language'],
    prose: ['description'],
  },
  // Names and usernames only. There is no field here that could hold a secret.
  vault: { delegate: 'vaultItem', fields: ['name', 'type', 'username', 'url', 'updatedAt'] },
};

export const EXPORTABLE = Object.keys(SOURCES);

interface Delegate {
  findMany(args?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async export(
    userId: string,
    what: string[],
    format: ExportFormat,
  ): Promise<{ body: string; filename: string; contentType: string }> {
    const names = what.length > 0 ? what : EXPORTABLE;
    for (const name of names) {
      if (!SOURCES[name]) {
        throw new BadRequestException(
          `Cannot export "${name}". Choose from: ${EXPORTABLE.join(', ')}.`,
        );
      }
    }

    const data: Record<string, Record<string, unknown>[]> = {};
    for (const name of names) {
      const source = SOURCES[name];
      data[name] = await (
        this.prisma[source.delegate as keyof PrismaService] as unknown as Delegate
      ).findMany({
        where: { userId },
        orderBy: { [source.orderBy ?? 'createdAt']: 'asc' },
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      return {
        body: JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2),
        filename: `developer-os-${stamp}.json`,
        contentType: 'application/json',
      };
    }
    if (format === 'csv') {
      return {
        body: names.map((name) => this.csv(name, data[name])).join('\n\n'),
        filename: `developer-os-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }
    return {
      body: names.map((name) => this.markdown(name, data[name])).join('\n'),
      filename: `developer-os-${stamp}.md`,
      contentType: 'text/markdown',
    };
  }

  /**
   * One CSV block per type, each with its own header row.
   *
   * Several types in one file is not strict CSV, and a spreadsheet will import
   * it as one sheet with section breaks. That is the honest trade for keeping
   * this a single download; ask for one type at a time to get a clean file.
   */
  private csv(name: string, rows: Record<string, unknown>[]): string {
    const fields = SOURCES[name].fields;
    const lines = [`# ${name}`, fields.join(',')];
    for (const row of rows) {
      lines.push(fields.map((field) => cell(row[field])).join(','));
    }
    return lines.join('\n');
  }

  private markdown(name: string, rows: Record<string, unknown>[]): string {
    const source = SOURCES[name];
    const [titleField, ...rest] = source.fields;
    const out = [`\n# ${source.label ?? title(name)}\n`];

    for (const row of rows) {
      out.push(`## ${String(row[titleField] ?? 'Untitled')}\n`);

      const facts = rest
        .filter((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')
        .map((field) => `- **${title(field)}:** ${plain(row[field])}`);
      if (facts.length > 0) out.push(`${facts.join('\n')}\n`);

      for (const field of source.prose ?? []) {
        const value = row[field];
        if (typeof value === 'string' && value.trim()) {
          out.push(`**${title(field)}**\n\n${value.trim()}\n`);
        }
      }
    }
    return out.join('\n');
  }
}

/** RFC 4180: quote anything containing a comma, quote or newline. */
function cell(value: unknown): string {
  const text = plain(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function plain(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

function title(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
