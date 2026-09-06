import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiRequestStatus,
  AiRole,
  type AiConversation,
  type EntityType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { found } from '../../common/query';
import { ProviderError } from '../providers/ai-provider.interface';
import { AiSettingsService } from '../settings/ai-settings.service';
import { ContextService } from './context.service';
import { buildPrompt, deriveTitle, type PromptSource } from './prompt';
import type { SendMessageDto } from '../dto/chat.dto';

/**
 * One event on the wire to the console (§37).
 *
 * `meta` arrives before the first token so the sources panel can render while
 * the model is still reading its prompt — on a cold 14B that is several
 * seconds of otherwise blank screen.
 */
export type ChatEvent =
  | { type: 'meta'; conversationId: string; model: string; sources: PromptSource[]; title: string }
  | { type: 'token'; text: string }
  | {
      type: 'done';
      messageId: string | null;
      durationMs: number;
      promptTokens: number | null;
      completionTokens: number | null;
      tokensPerSecond: number | null;
    }
  | { type: 'error'; reason: string; message: string };

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly context: ContextService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Runs one turn, yielding as the model produces it.
   *
   * Everything that can fail before the first token — no model chosen, model
   * missing, Ollama down — fails here as a ProviderError, so the controller can
   * answer with a status instead of a stream that opens and immediately dies.
   */
  async *send(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    signal: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    const settings = await this.settings.get(userId);
    const provider = await this.settings.provider(userId);

    const conversation = found(
      await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId } }),
      'conversation',
    );

    const model = dto.model?.trim() || conversation.model || this.defaultModel(settings.chatModel);
    if (!model) {
      throw new ProviderError(
        'MODEL_MISSING',
        'No model is selected. Choose one from the model list, or set OLLAMA_CHAT_MODEL.',
      );
    }

    const profile = dto.profileId
      ? await this.prisma.aiModelProfile.findFirst({ where: { id: dto.profileId, userId } })
      : null;
    const mode = dto.mode ?? profile?.mode ?? conversation.mode;

    // Rewinding happens before the history is read, so the turns being replaced
    // are gone by the time the prompt is built.
    if (dto.fromMessageId) await this.truncateFrom(conversationId, dto.fromMessageId);

    const question = dto.message.trim();
    const history = settings.retainMessages
      ? await this.prisma.aiMessage.findMany({
          where: { conversationId, role: { in: [AiRole.USER, AiRole.ASSISTANT] } },
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true },
        })
      : [];

    const built = await this.context.build(userId, {
      question,
      projectId: conversation.projectId,
      sources: conversation.sources as EntityType[],
      attached: conversation.attached,
    });

    const title =
      conversation.title === 'New conversation' && history.length === 0
        ? deriveTitle(question)
        : conversation.title;

    // The user's turn is stored before generation starts. If the model then
    // fails, the question is still in the thread to retry — losing what someone
    // typed because a server was busy is the worst failure this can have.
    if (settings.retainMessages) {
      await this.prisma.aiMessage.create({
        data: { conversationId, role: AiRole.USER, content: question },
      });
    }
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title, model, mode },
    });

    yield { type: 'meta', conversationId, model, sources: built.sources, title };

    const usage = await this.prisma.aiUsage.create({
      data: { userId, conversationId, model, provider: conversation.provider },
    });

    const messages = buildPrompt({
      mode,
      project: built.brief,
      sources: built.sources,
      history,
      question,
      systemPrompt: profile?.systemPrompt,
    });

    const started = Date.now();
    let answer = '';
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;

    try {
      for await (const chunk of provider.chat(
        {
          model,
          messages,
          temperature: profile?.temperature ?? settings.temperature,
          topP: profile?.topP,
          topK: profile?.topK,
          contextLength: profile?.contextLength,
        },
        signal,
      )) {
        if (chunk.text) {
          answer += chunk.text;
          yield { type: 'token', text: chunk.text };
        }
        if (chunk.done) {
          promptTokens = chunk.promptTokens ?? null;
          completionTokens = chunk.completionTokens ?? null;
        }
      }
    } catch (caught) {
      const error =
        caught instanceof ProviderError ? caught : new ProviderError('SERVER', String(caught));
      const cancelled = error.reason === 'CANCELLED' || signal.aborted;

      // A stopped answer is still an answer — the tokens are on screen, so
      // they are kept rather than thrown away for being incomplete (§12).
      const messageId =
        cancelled && answer
          ? await this.saveAnswer(conversation, {
              settings,
              model,
              answer: `${answer}\n\n_[stopped]_`,
              sources: built.sources,
              durationMs: Date.now() - started,
              promptTokens,
              completionTokens,
            })
          : null;

      await this.closeUsage(usage.id, {
        status: cancelled ? AiRequestStatus.CANCELLED : AiRequestStatus.ERROR,
        error: error.message,
        durationMs: Date.now() - started,
        messageId,
        promptTokens,
        completionTokens,
      });

      if (cancelled) {
        yield {
          type: 'done',
          messageId,
          durationMs: Date.now() - started,
          promptTokens,
          completionTokens,
          tokensPerSecond: null,
        };
        return;
      }
      this.logger.warn(`Generation failed on ${model}: ${error.message}`);
      yield { type: 'error', reason: error.reason, message: error.message };
      return;
    }

    const durationMs = Date.now() - started;
    const messageId = await this.saveAnswer(conversation, {
      settings,
      model,
      answer,
      sources: built.sources,
      durationMs,
      promptTokens,
      completionTokens,
    });

    await this.closeUsage(usage.id, {
      status: AiRequestStatus.OK,
      durationMs,
      messageId,
      promptTokens,
      completionTokens,
    });

    yield {
      type: 'done',
      messageId,
      durationMs,
      promptTokens,
      completionTokens,
      tokensPerSecond:
        completionTokens && durationMs > 0
          ? Number(((completionTokens / durationMs) * 1000).toFixed(1))
          : null,
    };
  }

  /** Null when retention is off: the transcript is the browser's, not ours. */
  private async saveAnswer(
    conversation: AiConversation,
    input: {
      settings: { retainMessages: boolean };
      model: string;
      answer: string;
      sources: PromptSource[];
      durationMs: number;
      promptTokens: number | null;
      completionTokens: number | null;
    },
  ): Promise<string | null> {
    if (!input.settings.retainMessages) return null;
    const message = await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: AiRole.ASSISTANT,
        content: input.answer,
        model: input.model,
        // Trimmed to what a citation needs. Storing the whole passage again
        // would duplicate the note into every answer that quoted it.
        sources: input.sources.map((source) => ({
          index: source.index,
          entityType: source.entityType,
          entityId: source.entityId,
          title: source.title,
          href: source.href,
          score: source.score,
          pinned: source.pinned,
          excerpt: source.content.slice(0, 320),
        })) as unknown as Prisma.InputJsonValue,
        durationMs: input.durationMs,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      },
    });
    return message.id;
  }

  private async closeUsage(
    id: string,
    input: {
      status: AiRequestStatus;
      durationMs: number;
      messageId: string | null;
      error?: string;
      promptTokens: number | null;
      completionTokens: number | null;
    },
  ): Promise<void> {
    await this.prisma.aiUsage.update({
      where: { id },
      data: {
        status: input.status,
        error: input.error,
        completedAt: new Date(),
        durationMs: input.durationMs,
        messageId: input.messageId,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      },
    });
  }

  /**
   * Deletes one message and everything after it.
   *
   * Cut by timestamp rather than by counting rows back from the end: the caller
   * names the turn it means, so regenerating the third answer of six rewinds to
   * the third and not to the sixth. Counting was the earlier version of this,
   * and it quietly destroyed the newest exchange while leaving the answer the
   * developer had actually clicked exactly where it was.
   *
   * A message id that is not in this conversation deletes nothing, so a stale
   * transcript in another tab cannot truncate the wrong thread.
   */
  private async truncateFrom(conversationId: string, messageId: string): Promise<void> {
    const anchor = await this.prisma.aiMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { createdAt: true },
    });
    if (!anchor) return;
    await this.prisma.aiMessage.deleteMany({
      where: { conversationId, createdAt: { gte: anchor.createdAt } },
    });
  }

  private defaultModel(fromSettings: string | null): string {
    return fromSettings ?? this.config.get<string>('ollama.chatModel') ?? '';
  }
}
