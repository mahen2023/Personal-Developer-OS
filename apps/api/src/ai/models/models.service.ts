import { Injectable } from '@nestjs/common';
import { AiRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiSettingsService } from '../settings/ai-settings.service';
import type {
  ModelSummary,
  ProviderStatus,
  PullProgress,
} from '../providers/ai-provider.interface';

/**
 * The model catalogue (§3, §5, §26).
 *
 * Ollama is the authority on what exists; this adds only what Ollama cannot
 * know — how often the developer has actually used each model, and which one
 * they chose as a default. Nothing here invents metadata: a field the server
 * does not report stays null and the console renders a blank (§5).
 */

export interface CatalogueModel extends ModelSummary {
  /** Generations recorded against this model, successful or not. */
  useCount: number;
  lastUsedAt: string | null;
  isDefault: boolean;
}

@Injectable()
export class ModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
  ) {}

  async status(userId: string): Promise<ProviderStatus> {
    return (await this.settings.provider(userId)).status();
  }

  async list(userId: string): Promise<CatalogueModel[]> {
    const [provider, settings, usage] = await Promise.all([
      this.settings.provider(userId),
      this.settings.describe(userId),
      this.prisma.aiUsage.groupBy({
        by: ['model'],
        where: { userId },
        _count: { model: true },
        _max: { startedAt: true },
      }),
    ]);

    const counts = new Map(usage.map((row) => [row.model, row]));
    const models = await provider.listModels();

    return models.map((model) => {
      const used = counts.get(model.name);
      return {
        ...model,
        useCount: used?._count.model ?? 0,
        lastUsedAt: used?._max.startedAt?.toISOString() ?? null,
        isDefault: settings.chatModel === model.name,
      };
    });
  }

  async describe(userId: string, model: string) {
    return (await this.settings.provider(userId)).describe(model);
  }

  /**
   * Downloads a model, reporting progress as it arrives (§27).
   *
   * No background job: the download runs inside Ollama, not inside this
   * process, so there is nothing here to keep alive. Closing the browser
   * abandons the progress stream, not the download — which is what a user
   * expects from `ollama pull` and means the rest of the app never blocks.
   */
  async *pull(userId: string, model: string, signal: AbortSignal): AsyncIterable<PullProgress> {
    const provider = await this.settings.provider(userId);
    yield* provider.pull(model, signal);
  }

  async remove(userId: string, model: string): Promise<void> {
    const provider = await this.settings.provider(userId);
    await provider.remove(model);
  }

  /** How the console reports generation health, per §30 and §31. */
  async usage(userId: string, limit = 20) {
    const [recent, totals] = await Promise.all([
      this.prisma.aiUsage.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: { conversation: { select: { id: true, title: true } } },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      }),
    ]);

    return {
      recent,
      totals: {
        ok: totals.find((row) => row.status === AiRequestStatus.OK)?._count.status ?? 0,
        error: totals.find((row) => row.status === AiRequestStatus.ERROR)?._count.status ?? 0,
        cancelled:
          totals.find((row) => row.status === AiRequestStatus.CANCELLED)?._count.status ?? 0,
      },
    };
  }
}
