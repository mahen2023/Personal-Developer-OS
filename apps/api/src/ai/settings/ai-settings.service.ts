import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMode, type AiSetting } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaProvider } from '../providers/ollama.provider';
import { EmbeddingService } from '../embedding.service';
import type { UpdateAiSettingsDto } from '../dto/chat.dto';

/**
 * The console's settings (§25, §56).
 *
 * Every column is nullable and null means "follow the environment". That is
 * what makes a deployment's `.env` a real default rather than a value copied
 * into the database on first boot and then frozen: change OLLAMA_BASE_URL and
 * anyone who never overrode it moves with it.
 */
@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaProvider,
    private readonly embeddings: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  /** The stored row, or the defaults it would have. */
  async get(userId: string): Promise<AiSetting> {
    const existing = await this.prisma.aiSetting.findUnique({ where: { userId } });
    if (existing) return existing;
    return {
      userId,
      provider: 'OLLAMA',
      baseUrl: null,
      chatModel: null,
      embeddingModel: null,
      defaultMode: AiMode.GENERAL,
      temperature: null,
      privateMode: true,
      retainMessages: true,
      updatedAt: new Date(),
    };
  }

  async update(userId: string, dto: UpdateAiSettingsDto): Promise<AiSetting> {
    const data = {
      baseUrl: dto.baseUrl === undefined ? undefined : dto.baseUrl?.trim() || null,
      chatModel: dto.chatModel === undefined ? undefined : dto.chatModel?.trim() || null,
      embeddingModel:
        dto.embeddingModel === undefined ? undefined : dto.embeddingModel?.trim() || null,
      defaultMode: dto.defaultMode,
      temperature: dto.temperature === undefined ? undefined : (dto.temperature ?? null),
      privateMode: dto.privateMode,
      retainMessages: dto.retainMessages,
    };
    return this.prisma.aiSetting.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /** A provider aimed at this user's server. */
  async provider(userId: string): Promise<OllamaProvider> {
    const settings = await this.get(userId);
    return this.ollama.withBaseUrl(settings.baseUrl);
  }

  /**
   * What the console needs to describe itself before anything is asked (§6, §32).
   *
   * Reports the effective values, not the stored ones, so the settings screen
   * can show what is actually in force and where it came from.
   */
  async describe(userId: string) {
    const settings = await this.get(userId);
    const provider = this.ollama.withBaseUrl(settings.baseUrl);
    return {
      provider: settings.provider,
      /** LOCAL, REMOTE or OFFLINE is decided by the caller from status (§46). */
      isLocal: provider.isLocal,
      endpoint: provider.endpoint,
      endpointSource: settings.baseUrl ? 'settings' : 'environment',
      chatModel: settings.chatModel ?? this.config.get<string>('ollama.chatModel') ?? null,
      embeddingModel:
        settings.embeddingModel ?? this.config.get<string>('ollama.embeddingModel') ?? null,
      defaultMode: settings.defaultMode,
      temperature: settings.temperature,
      privateMode: settings.privateMode,
      retainMessages: settings.retainMessages,
      // The index the console searches is built by whatever EMBEDDING_PROVIDER
      // says, which is not necessarily Ollama. Saying so here stops the two
      // being confused on the settings screen.
      indexEmbeddingModel: this.embeddings.model,
      indexMatching: this.embeddings.kind,
    };
  }
}
