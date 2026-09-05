import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider, RepoProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { type Bytes, envelopeKey, open, seal } from '../vault/envelope';
import { PROVIDERS, cloudflareZones, githubRepo, gitlabProject, repoRef } from './providers';

export interface SyncResult {
  provider: IntegrationProvider;
  checked: number;
  updated: number;
  created: number;
  /** Records this integration could not speak for. Named, not swallowed. */
  skipped: string[];
  error?: string;
}

/** Never includes the token, in any shape. */
const PUBLIC = {
  id: true,
  provider: true,
  account: true,
  scopes: true,
  isEnabled: true,
  lastSyncAt: true,
  lastError: true,
  createdAt: true,
} as const;

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly key: Bytes;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.key = envelopeKey(config.get<string>('vault.envelopeKey') ?? '');
  }

  /** What exists, plus what could exist. The screen renders both from this. */
  async list(userId: string) {
    const connected = await this.prisma.integration.findMany({
      where: { userId },
      select: PUBLIC,
      orderBy: { provider: 'asc' },
    });

    return {
      connected,
      available: Object.values(PROVIDERS).map((provider) => ({
        id: provider.id,
        label: provider.label,
        does: provider.does,
        tokenUrl: provider.tokenUrl,
        scopeHint: provider.scopeHint,
      })),
    };
  }

  /**
   * Verifies a token with the provider before storing it.
   *
   * Storing first and testing later produces an integration that looks
   * connected and silently does nothing — the failure mode this whole screen
   * exists to prevent. A token that cannot identify itself is not saved.
   */
  async connect(userId: string, provider: IntegrationProvider, token: string) {
    const client = PROVIDERS[provider];
    if (!client) throw new BadRequestException('That provider is not supported in this build.');

    const identity = await client.identify(token.trim()).catch((caught: Error) => {
      throw new BadRequestException(caught.message);
    });

    const sealed = seal(new Uint8Array(Buffer.from(token.trim(), 'utf8')) as Bytes, this.key);
    const data = {
      account: identity.account,
      token: sealed,
      scopes: identity.scopes,
      isEnabled: true,
      lastError: null,
    };

    const saved = await this.prisma.integration.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, ...data },
      update: data,
      select: PUBLIC,
    });

    await this.activity.record({
      userId,
      action: 'integration.connected',
      summary: `Connected ${client.label} as ${identity.account}`,
      // The account name is not a secret and is the whole point of the line.
      meta: { provider, account: identity.account },
    });
    return saved;
  }

  async disconnect(userId: string, provider: IntegrationProvider): Promise<void> {
    await this.prisma.integration.deleteMany({ where: { userId, provider } });
    await this.activity.record({
      userId,
      action: 'integration.disconnected',
      summary: `Disconnected ${PROVIDERS[provider]?.label ?? provider}`,
      meta: { provider },
    });
  }

  async setEnabled(userId: string, provider: IntegrationProvider, isEnabled: boolean) {
    await this.prisma.integration.updateMany({
      where: { userId, provider },
      data: { isEnabled },
    });
    return this.list(userId);
  }

  /** Re-asks the provider who the stored token belongs to. */
  async test(
    userId: string,
    provider: IntegrationProvider,
  ): Promise<{ ok: boolean; detail: string }> {
    const token = await this.tokenFor(userId, provider);
    if (!token) return { ok: false, detail: 'Not connected.' };

    try {
      const identity = await PROVIDERS[provider].identify(token);
      await this.prisma.integration.updateMany({
        where: { userId, provider },
        data: { account: identity.account, scopes: identity.scopes, lastError: null },
      });
      return { ok: true, detail: `Connected as ${identity.account}.` };
    } catch (caught) {
      const detail = (caught as Error).message;
      await this.prisma.integration.updateMany({
        where: { userId, provider },
        data: { lastError: detail },
      });
      return { ok: false, detail };
    }
  }

  /* ── syncing ────────────────────────────────────────────────────────────── */

  /** Every enabled integration. What the nightly job and the button both call. */
  async syncAll(userId: string): Promise<SyncResult[]> {
    const rows = await this.prisma.integration.findMany({
      where: { userId, isEnabled: true },
      select: { provider: true },
    });

    const results: SyncResult[] = [];
    for (const row of rows) {
      results.push(await this.sync(userId, row.provider));
    }
    return results;
  }

  async sync(userId: string, provider: IntegrationProvider): Promise<SyncResult> {
    const token = await this.tokenFor(userId, provider);
    if (!token) {
      return { provider, checked: 0, updated: 0, created: 0, skipped: [], error: 'Not connected.' };
    }

    try {
      const result =
        provider === IntegrationProvider.CLOUDFLARE
          ? await this.syncZones(userId, token)
          : await this.syncRepositories(userId, provider, token);

      await this.prisma.integration.updateMany({
        where: { userId, provider },
        data: { lastSyncAt: new Date(), lastError: null },
      });
      return { provider, ...result };
    } catch (caught) {
      const error = (caught as Error).message;
      this.logger.warn(`${provider} sync failed: ${error}`);
      await this.prisma.integration.updateMany({
        where: { userId, provider },
        data: { lastSyncAt: new Date(), lastError: error },
      });
      return { provider, checked: 0, updated: 0, created: 0, skipped: [], error };
    }
  }

  /**
   * Brings each repository record in line with its remote.
   *
   * Only fields the remote is authoritative for are touched — description,
   * language, default branch, visibility. The project a repository belongs to,
   * and its local path, are yours; a sync must never overwrite them.
   */
  private async syncRepositories(
    userId: string,
    provider: IntegrationProvider,
    token: string,
  ): Promise<Omit<SyncResult, 'provider'>> {
    const repositories = await this.prisma.repository.findMany({
      where: {
        userId,
        provider:
          provider === IntegrationProvider.GITHUB ? RepoProvider.GITHUB : RepoProvider.GITLAB,
      },
    });

    let updated = 0;
    const skipped: string[] = [];

    for (const repository of repositories) {
      const ref = repoRef(repository.url, repository.provider);
      if (!ref || ref.host !== provider) {
        skipped.push(
          `${repository.name} — ${repository.url} is not a ${provider} URL this build can read`,
        );
        continue;
      }

      try {
        const [owner, ...rest] = ref.path.split('/');
        const facts =
          provider === IntegrationProvider.GITHUB
            ? await githubRepo(token, owner, rest.join('/'))
            : await gitlabProject(token, ref.path);

        await this.prisma.repository.update({
          where: { id: repository.id },
          data: {
            description: facts.description,
            defaultBranch: facts.defaultBranch,
            language: facts.language ?? repository.language,
            isPrivate: facts.isPrivate,
            url: facts.url,
            lastSyncedAt: new Date(),
          },
        });
        updated += 1;
      } catch (caught) {
        skipped.push(`${repository.name} — ${(caught as Error).message}`);
      }
    }

    return { checked: repositories.length, updated, created: 0, skipped };
  }

  /**
   * Records a domain for each Cloudflare zone that has none.
   *
   * Creates but never overwrites: an existing record may carry a registrar, an
   * expiry date and notes that Cloudflare knows nothing about, and losing
   * those to a sync would be worse than the sync not running.
   */
  private async syncZones(userId: string, token: string): Promise<Omit<SyncResult, 'provider'>> {
    const zones = await cloudflareZones(token);
    const existing = new Set(
      (await this.prisma.domain.findMany({ where: { userId }, select: { name: true } })).map(
        (row) => row.name.toLowerCase(),
      ),
    );

    let created = 0;
    for (const zone of zones) {
      if (existing.has(zone.name.toLowerCase())) continue;
      await this.prisma.domain.create({
        data: {
          userId,
          name: zone.name,
          dnsProvider: 'Cloudflare',
          notes: `Imported from Cloudflare. Zone status: ${zone.status}.`,
        },
      });
      created += 1;
    }

    return {
      checked: zones.length,
      updated: 0,
      created,
      // Not a failure: a zone already recorded is the normal case.
      skipped: [],
    };
  }

  /** Decrypts the stored token. The only place this happens. */
  private async tokenFor(userId: string, provider: IntegrationProvider): Promise<string | null> {
    const row = await this.prisma.integration.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { token: true },
    });
    if (!row) return null;
    return Buffer.from(open(row.token as Bytes, this.key)).toString('utf8');
  }
}
