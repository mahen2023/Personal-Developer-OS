import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Backup and restore (§52), and the data behind export (§51).
 *
 * A backup is a gzipped JSON document holding every row that belongs to one
 * account. It is deliberately not a `pg_dump`: this file has to be restorable
 * by the application itself, on a machine that may not have Postgres tooling
 * installed, and has to survive a schema that has moved on since it was
 * written.
 *
 * On secrets: vault rows are included as the ciphertext they are. That is the
 * only way a restore can give you your passwords back. Nothing in this file is
 * readable without both the master password and VAULT_ENVELOPE_KEY, and the
 * envelope key is *not* in the backup — so a stolen backup on its own is
 * inert. Keep the key somewhere else, or the backup becomes the whole vault.
 */

/**
 * Every table that belongs to an account, in an order a restore can replay:
 * a row is only ever written after whatever it points at.
 *
 * Two are absent on purpose. `Session` is a live login, and restoring one
 * would resurrect a session that was signed out. `Chunk` is derived from the
 * rows above it and is rebuilt by re-indexing, so carrying it would double the
 * file size to save a few seconds.
 */
const TABLES = [
  'project',
  'repository',
  'environment',
  'server',
  'databaseInstance',
  'domain',
  'sslCertificate',
  'deployment',
  'note',
  'task',
  'issue',
  'solution',
  'snippet',
  'command',
  'adr',
  'meeting',
  'document',
  'bookmark',
  'learningItem',
  'idea',
  'vaultProfile',
  'vaultItem',
  'tag',
  'entityLink',
  'activity',
  'notification',
  'auditLog',
] as const;

type Table = (typeof TABLES)[number];

interface Backup {
  format: 1;
  createdAt: string;
  /** So a restore can warn when the file predates a schema change. */
  appVersion: string;
  user: { id: string; email: string; name: string; timezone: string; settings: unknown };
  counts: Record<string, number>;
  rows: Record<string, unknown[]>;
}

interface Delegate {
  findMany(args?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  createMany(args: { data: unknown[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly directory: string;
  private readonly keep: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.directory = resolve(config.get<string>('backup.path') ?? './backups');
    this.keep = config.get<number>('backup.keep') ?? 7;
  }

  /* ── writing ────────────────────────────────────────────────────────────── */

  /** Builds the document. Also the export payload, so there is one code path. */
  async dump(userId: string): Promise<Backup> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, timezone: true, settings: true },
    });

    const rows: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const found = await this.delegate(table).findMany({ where: { userId } });
      rows[table] = found;
      counts[table] = found.length;
    }

    return {
      format: 1,
      createdAt: new Date().toISOString(),
      appVersion: process.env.npm_package_version ?? '0.1.0',
      user,
      counts,
      rows,
    };
  }

  /** Writes a backup to disk and prunes old ones. `userId` absent means all. */
  async create(userId?: string): Promise<{ file: string; bytes: number; users: number }> {
    await mkdir(this.directory, { recursive: true });

    const users = userId
      ? [{ id: userId }]
      : await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true } });

    const document = {
      createdAt: new Date().toISOString(),
      accounts: await Promise.all(users.map((row) => this.dump(row.id))),
    };

    // Bytes are what get gzipped, and JSON has no bigint or Buffer — so the
    // replacer is not a nicety, it is what makes vault rows survive the trip.
    const body = gzipSync(Buffer.from(JSON.stringify(document, encode), 'utf8'));
    const file = `devos-${document.createdAt.replace(/[:.]/g, '-')}.json.gz`;
    await writeFile(join(this.directory, file), body);

    await this.prune();
    return { file, bytes: body.byteLength, users: users.length };
  }

  /** Newest first, so the settings screen can show the last one at a glance. */
  async list(): Promise<{ file: string; bytes: number; createdAt: string }[]> {
    const names = await readdir(this.directory).catch(() => []);
    const files = await Promise.all(
      names
        .filter((name) => name.endsWith('.json.gz'))
        .map(async (name) => {
          const info = await stat(join(this.directory, name));
          return { file: name, bytes: info.size, createdAt: info.mtime.toISOString() };
        }),
    );
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async read(file: string): Promise<Buffer> {
    return readFile(join(this.directory, this.safeName(file)));
  }

  private async prune(): Promise<void> {
    const files = await this.list();
    for (const old of files.slice(this.keep)) {
      await unlink(join(this.directory, old.file)).catch(() => undefined);
    }
  }

  /* ── reading back ───────────────────────────────────────────────────────── */

  /**
   * Restores one account from a backup document.
   *
   * `replace` is the destructive one and is never the default: it deletes what
   * is there before writing, which is what you want after losing a database
   * and never what you want by accident. The merge mode skips rows whose id
   * already exists, so restoring twice changes nothing.
   */
  async restore(
    userId: string,
    body: Buffer,
    options: { replace: boolean },
  ): Promise<{ restored: Record<string, number>; skipped: string[] }> {
    const account = this.parse(body, userId);
    const restored: Record<string, number> = {};
    const skipped: string[] = [];

    if (options.replace) {
      // Reverse order: children before the rows they point at.
      for (const table of [...TABLES].reverse()) {
        await this.delegate(table).deleteMany({ where: { userId } });
      }
    }

    for (const table of TABLES) {
      const rows = account.rows[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try {
        const { count } = await this.delegate(table).createMany({
          // Every row already carries the ids it needs, and they are owned by
          // this account — so the graph reconnects itself with no id mapping.
          data: rows.map((row) => decode(row as Record<string, unknown>, userId)),
          skipDuplicates: true,
        });
        restored[table] = count;
      } catch (caught) {
        // A table the current schema no longer accepts is reported, not fatal:
        // restoring 26 of 27 tables beats restoring none.
        skipped.push(`${table} (${(caught as Error).message.split('\n')[0]})`);
      }
    }

    this.logger.warn(`Restored ${Object.keys(restored).length} tables for ${userId}`);
    return { restored, skipped };
  }

  /** Reads the envelope and finds this user's account inside it. */
  private parse(body: Buffer, userId: string): Backup {
    let text: string;
    try {
      // Accept both the gzipped file and a plain JSON export.
      text = (body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8');
    } catch {
      throw new BadRequestException('That file is not a Developer OS backup.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException('That file is not valid JSON.');
    }

    const accounts = (parsed as { accounts?: Backup[] }).accounts ?? [parsed as Backup];
    const account = accounts.find((entry) => entry?.rows) ?? null;
    if (!account) throw new BadRequestException('That backup contains no records.');
    if (account.format !== 1) {
      throw new BadRequestException(
        `That backup is format ${String(account.format)}; this build reads format 1.`,
      );
    }
    if (account.user?.id && account.user.id !== userId) {
      // Restoring someone else's export into your account would silently
      // rewrite ownership on every row. Refuse rather than guess.
      throw new BadRequestException(
        'That backup belongs to a different account. Restore it into the account it came from.',
      );
    }
    return account;
  }

  private delegate(table: Table): Delegate {
    return this.prisma[table as keyof PrismaService] as unknown as Delegate;
  }

  /** A filename, never a path. Backups are chosen from a list, not typed. */
  private safeName(file: string): string {
    const name = basename(file);
    if (!/^devos-[\w.-]+\.json\.gz$/.test(name)) {
      throw new BadRequestException('That is not a backup file name.');
    }
    return name;
  }
}

/* ── JSON that survives Postgres types ────────────────────────────────────── */

/** Marks the values JSON cannot carry, so `decode` can put them back. */
function encode(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return { __t: 'bigint', v: value.toString() };
  if (value instanceof Uint8Array)
    return { __t: 'bytes', v: Buffer.from(value).toString('base64') };
  return value;
}

function decode(row: Record<string, unknown>, userId: string): Record<string, unknown> {
  const result: Record<string, unknown> = { userId };
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === 'object' && '__t' in value) {
      const tagged = value as { __t: string; v: string };
      result[key] = tagged.__t === 'bytes' ? Buffer.from(tagged.v, 'base64') : BigInt(tagged.v);
    } else if (typeof value === 'string' && ISO_DATE.test(value)) {
      result[key] = new Date(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
