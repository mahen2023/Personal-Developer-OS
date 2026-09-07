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

    // Rewinding happens before the history is read, so the turn being replaced
    // is gone by the time the prompt is built. `at` is the slot it occupied:
    // the replacement goes back into it rather than onto the end.
    const at = dto.fromMessageId ? await this.rewind(conversationId, dto.fromMessageId) : null;

    const question = dto.message.trim();
    const history = settings.retainMessages
      ? await this.prisma.aiMessage.findMany({
          where: {
            conversationId,
            role: { in: [AiRole.USER, AiRole.ASSISTANT] },
            // Only what came before the turn being replaced. Showing the model
            // the turns that follow would be asking it to write the past with
            // the future already in hand.
            ...(at ? { createdAt: { lt: at } } : {}),
          },
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
        data: {
          conversationId,
          role: AiRole.USER,
          content: question,
          // Keeping the original timestamp is what keeps the turn in place.
          // Ordering is by createdAt, so a replacement stamped `now` would
          // reappear at the bottom of a conversation it came from the middle of.
          ...(at ? { createdAt: at } : {}),
        },
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
              at,
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
      at,
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
      /** The slot the replaced turn occupied, when this is a rewind. */
      at?: Date | null;
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
        // A millisecond after its question, which is still comfortably before
        // whatever came next: the original answer took seconds to arrive.
        ...(input.at ? { createdAt: new Date(input.at.getTime() + 1) } : {}),
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
   * Clears one turn so it can be asked again, and returns the slot it held.
   *
   * A turn is a question and the answer it drew. Only those two rows go: an
   * earlier version of this deleted everything from the anchor to the end of
   * the conversation, on the reasoning that a later answer no longer follows
   * from an edited question. That reasoning is defensible and the behaviour was
   * not — regenerating the second answer of six silently destroyed four turns
   * of work, with no warning and nothing to undo it. Losing what someone wrote
   * is worse than a thread that reads a little out of step, and the model is
   * shown only the turns before this one so what it writes is at least honest
   * about what it had.
   *
   * An id that is not in this conversation clears nothing, so a stale
   * transcript in another tab cannot cut into the wrong thread.
   */
  private async rewind(conversationId: string, messageId: string): Promise<Date | null> {
    const anchor = await this.prisma.aiMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, role: true, createdAt: true },
    });
    if (!anchor) return null;

    // Normalise to the question. Regenerate points at the answer from some
    // callers and at the question from others; a turn begins at its question
    // either way.
    const question =
      anchor.role === AiRole.USER
        ? anchor
        : ((await this.prisma.aiMessage.findFirst({
            where: { conversationId, role: AiRole.USER, createdAt: { lt: anchor.createdAt } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, role: true, createdAt: true },
          })) ?? anchor);

    // Everything between this question and the next one — its answer, and any
    // marker written alongside it.
    const after = await this.prisma.aiMessage.findMany({
      where: { conversationId, createdAt: { gt: question.createdAt } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true },
    });

    await this.prisma.aiMessage.deleteMany({
      where: { id: { in: turnSpan(question.id, after) } },
    });
    return question.createdAt;
  }

  private defaultModel(fromSettings: string | null): string {
    return fromSettings ?? this.config.get<string>('ollama.chatModel') ?? '';
  }
}

/**
 * The rows that make up one turn: a question, and the reply it drew.
 *
 * Stops at the next question, so nothing beyond this turn is ever included —
 * that boundary is the whole point, and getting it wrong deletes someone's
 * conversation. A marker written between the two (a model switch, say) belongs
 * to the turn it interrupted and goes with it.
 *
 * `following` must be every message after the question, oldest first.
 */
export function turnSpan(questionId: string, following: { id: string; role: AiRole }[]): string[] {
  const span = [questionId];
  for (const row of following) {
    // The next question begins the next turn, and this one is over.
    if (row.role === AiRole.USER) break;
    span.push(row.id);
    // An answer ends the turn. Anything after it belongs to what came next.
    if (row.role === AiRole.ASSISTANT) break;
  }
  return span;
}
