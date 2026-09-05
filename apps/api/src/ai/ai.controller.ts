import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service';
import { RetrievalService } from './retrieval.service';
import { IndexerService, type SourceName } from './indexer.service';
import { AskDto, ReindexDto, SemanticSearchDto, SimilarDto } from './ai.dto';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';

const SOURCES = ['note', 'solution', 'issue', 'adr', 'meeting', 'snippet', 'document'] as const;

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly retrieval: RetrievalService,
    private readonly indexer: IndexerService,
  ) {}

  /** What this build can actually do, so the UI never promises more. */
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    return {
      ...this.assistant.capabilities(),
      index: await this.retrieval.stats(user.id),
      sources: SOURCES,
    };
  }

  // A question can cost a model call. Slower than the default so a stuck
  // component cannot spend the month's budget in a render loop.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('ask')
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskDto) {
    return this.assistant.ask(user.id, dto.question, { projectId: dto.projectId });
  }

  /** Retrieval on its own — no model, no cost, useful in its own right. */
  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() dto: SemanticSearchDto) {
    return this.retrieval.search(user.id, dto.q, {
      limit: dto.limit,
      projectId: dto.projectId,
      types: dto.types,
    });
  }

  @Post('similar')
  similar(@CurrentUser() user: AuthUser, @Body() dto: SimilarDto) {
    return this.assistant.similar(user.id, dto.text, dto.exclude);
  }

  /**
   * Rebuilds the index. Deliberately synchronous and rate limited: on a
   * personal corpus it takes seconds, and a progress bar for a job that
   * finishes before it renders is a worse experience than waiting.
   */
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @Post('reindex')
  async reindex(@CurrentUser() user: AuthUser, @Body() dto: ReindexDto) {
    if (dto.source && !SOURCES.includes(dto.source as (typeof SOURCES)[number])) {
      throw new BadRequestException(`Unknown source. Choose one of: ${SOURCES.join(', ')}.`);
    }
    const extracted = await this.indexer.extractDocuments(user.id);
    const report = await this.indexer.reindex(user.id, dto.source as SourceName | undefined);
    return { ...report, documents: extracted };
  }
}
