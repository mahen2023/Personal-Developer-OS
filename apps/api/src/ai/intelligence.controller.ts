import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AiMode } from '@prisma/client';
import { ChatService, type ChatEvent } from './chat/chat.service';
import { ConversationsService } from './conversations/conversations.service';
import { KnowledgeService } from './chat/knowledge.service';
import { ModelsService } from './models/models.service';
import { AiSettingsService } from './settings/ai-settings.service';
import { ProfilesService } from './models/profiles.service';
import { ProviderError } from './providers/ai-provider.interface';
import { MODE_LIST, SELECTABLE_SOURCES } from './chat/modes';
import {
  ConversationQueryDto,
  CreateConversationDto,
  MessagePageDto,
  ModelProfileDto,
  PullModelDto,
  SaveAsDto,
  SendMessageDto,
  TestConnectionDto,
  UpdateAiSettingsDto,
  UpdateConversationDto,
} from './dto/chat.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

/**
 * The Developer Intelligence console's API (§36).
 *
 * Separate from `AiController`, which is the older retrieval surface — that one
 * answers a question with passages and no model, and is still what the search
 * box and the "have I hit this before?" panel use. This one is the console.
 */
@ApiTags('intelligence')
@Controller('ai')
export class IntelligenceController {
  constructor(
    private readonly chat: ChatService,
    private readonly conversations: ConversationsService,
    private readonly knowledge: KnowledgeService,
    private readonly models: ModelsService,
    private readonly profiles: ProfilesService,
    private readonly settings: AiSettingsService,
  ) {}

  /* ── the engine ────────────────────────────────────────────────────────── */

  @Get('providers')
  async providers(@CurrentUser() user: AuthUser) {
    const settings = await this.settings.describe(user.id);
    return {
      // One entry today. The console renders a list because §33 says the chat
      // must not care which engine answered, and a list of one proves it.
      providers: [
        {
          kind: settings.provider,
          label: 'Ollama',
          isLocal: settings.isLocal,
          endpoint: settings.endpoint,
          available: true,
        },
      ],
      active: settings.provider,
      modes: MODE_LIST.map(({ mode, label, hint, defaultSources }) => ({
        mode,
        label,
        hint,
        defaultSources,
      })),
      sources: SELECTABLE_SOURCES,
      settings,
    };
  }

  @Get('ollama/status')
  async ollamaStatus(@CurrentUser() user: AuthUser) {
    const [status, settings] = await Promise.all([
      this.models.status(user.id),
      this.settings.describe(user.id),
    ]);
    return {
      ...status,
      // LOCAL, REMOTE or OFFLINE (§46). A configured URL that is not loopback
      // is a remote engine, and the console says so rather than claiming
      // everything is on this machine.
      placement:
        status.state !== 'ONLINE' ? 'OFFLINE' : isLoopback(status.endpoint) ? 'LOCAL' : 'REMOTE',
      privateMode: settings.privateMode,
      chatModel: settings.chatModel,
    };
  }

  /** Tests a URL before it is saved, so the setup wizard can verify step 2. */
  @Post('ollama/test')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async test(@CurrentUser() user: AuthUser, @Body() dto: TestConnectionDto) {
    const provider = (await this.settings.provider(user.id)).withBaseUrl(dto.baseUrl);
    const status = await provider.status();
    const models = status.state === 'ONLINE' ? await provider.listModels().catch(() => []) : [];
    return { ...status, models: models.map((model) => model.name) };
  }

  @Get('ollama/models')
  models_(@CurrentUser() user: AuthUser) {
    return this.models.list(user.id);
  }

  @Get('ollama/models/:name')
  describe(@CurrentUser() user: AuthUser, @Param('name') name: string) {
    return this.models.describe(user.id, name);
  }

  /**
   * Streams a model download (§27).
   *
   * SSE rather than a job queue: the download happens inside Ollama, so there
   * is nothing on this side to keep alive. A closed browser abandons the
   * progress view, never the download.
   */
  @Post('models/pull')
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  async pull(
    @CurrentUser() user: AuthUser,
    @Body() dto: PullModelDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const controller = abortOn(request);
    await stream(
      response,
      async function* (this: IntelligenceController) {
        for await (const progress of this.models.pull(user.id, dto.model, controller.signal)) {
          yield { type: 'progress', ...progress };
        }
      }.call(this),
    );
  }

  @Delete('models/:name')
  @HttpCode(204)
  async removeModel(@CurrentUser() user: AuthUser, @Param('name') name: string): Promise<void> {
    // Deliberately no cascade of any kind: deleting a model must never touch a
    // conversation that used it. The transcript records what answered it, and
    // that stays true after the weights are gone (§26).
    await this.models.remove(user.id, name);
  }

  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.models.usage(user.id);
  }

  /* ── settings and profiles ─────────────────────────────────────────────── */

  @Get('settings')
  aiSettings(@CurrentUser() user: AuthUser) {
    return this.settings.describe(user.id);
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiSettingsDto) {
    await this.settings.update(user.id, dto);
    return this.settings.describe(user.id);
  }

  @Get('profiles')
  listProfiles(@CurrentUser() user: AuthUser) {
    return this.profiles.list(user.id);
  }

  @Post('profiles')
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: ModelProfileDto) {
    return this.profiles.create(user.id, dto);
  }

  @Patch('profiles/:id')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModelProfileDto,
  ) {
    return this.profiles.update(user.id, id, dto);
  }

  @Delete('profiles/:id')
  @HttpCode(204)
  removeProfile(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.remove(user.id, id);
  }

  /* ── conversations ─────────────────────────────────────────────────────── */

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthUser, @Query() dto: ConversationQueryDto) {
    return this.conversations.list(user.id, dto);
  }

  @Post('conversations')
  async createConversation(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto) {
    const settings = await this.settings.describe(user.id);
    return this.conversations.create(
      user.id,
      { mode: settings.defaultMode as AiMode, ...dto },
      settings.chatModel ?? '',
    );
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.get(user.id, id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: MessagePageDto,
  ) {
    return this.conversations.messages(user.id, id, dto);
  }

  @Patch('conversations/:id')
  updateConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversations.update(user.id, id, dto);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  removeConversation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.remove(user.id, id);
  }

  /* ── the conversation itself ───────────────────────────────────────────── */

  /**
   * One turn, streamed (§12, §37).
   *
   * Server-sent events rather than a socket: this is one-directional, it
   * survives the Next proxy unchanged, and stopping is a closed connection
   * rather than a protocol message.
   *
   * The throttle is generous because a local model costs electricity rather
   * than money, and mean because a render loop can still hammer a GPU.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const controller = abortOn(request);
    await stream(response, this.chat.send(user.id, id, dto, controller.signal));
  }

  @Post('messages/:id/save')
  saveAs(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveAsDto,
  ) {
    return this.knowledge.save(user.id, id, dto);
  }
}

/* ── server-sent events ────────────────────────────────────────────────────── */

/**
 * Writes an async iterable out as SSE.
 *
 * Headers go out before the first item so the browser's `EventSource`-style
 * reader starts immediately; `X-Accel-Buffering` is there for nginx, which
 * otherwise holds a stream until it has a few kilobytes and makes a working
 * console look frozen behind a reverse proxy.
 *
 * A failure after the first byte cannot become an HTTP status — the status is
 * long gone — so it is sent as a final `error` event instead. That is why
 * ChatService yields errors rather than throwing them mid-stream.
 */
async function stream(
  response: Response,
  events: AsyncIterable<ChatEvent | Record<string, unknown>>,
): Promise<void> {
  response.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();

  try {
    for await (const event of events) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (caught) {
    const error =
      caught instanceof ProviderError
        ? { type: 'error', reason: caught.reason, message: caught.message }
        : {
            type: 'error',
            reason: 'SERVER',
            message: (caught as BadRequestException).message ?? 'The request failed.',
          };
    response.write(`data: ${JSON.stringify(error)}\n\n`);
  } finally {
    response.end();
  }
}

/** The stop button, and the closed tab, are the same signal to the model. */
function abortOn(request: Request): AbortController {
  const controller = new AbortController();
  request.on('close', () => controller.abort());
  return controller;
}

function isLoopback(endpoint: string): boolean {
  try {
    const { hostname } = new URL(endpoint);
    return ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(hostname);
  } catch {
    return false;
  }
}
