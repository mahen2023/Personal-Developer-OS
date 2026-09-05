import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SearchModule } from '../search/search.module';
import { AiController } from './ai.controller';
import { IntelligenceController } from './intelligence.controller';
import { AssistantService } from './assistant.service';
import { EmbeddingService } from './embedding.service';
import { IndexerService } from './indexer.service';
import { RetrievalService } from './retrieval.service';
import { OllamaProvider } from './providers/ollama.provider';
import { AiSettingsService } from './settings/ai-settings.service';
import { ContextService } from './chat/context.service';
import { ChatService } from './chat/chat.service';
import { KnowledgeService } from './chat/knowledge.service';
import { ConversationsService } from './conversations/conversations.service';
import { ModelsService } from './models/models.service';
import { ProfilesService } from './models/profiles.service';

/**
 * Phase 6 and the Developer Intelligence console.
 *
 * Everything here degrades rather than fails: with no keys and no Ollama the
 * index still builds, search still returns passages, and only the written
 * answer is missing. The console reports that state instead of erroring, which
 * is what §46 means by the rest of the application continuing to work.
 *
 * Global because indexing is cross-cutting — six modules write records that
 * belong in the index, and having each of them import this one would say
 * nothing except that indexing exists.
 */
@Global()
@Module({
  imports: [StorageModule, SearchModule],
  controllers: [AiController, IntelligenceController],
  providers: [
    EmbeddingService,
    IndexerService,
    RetrievalService,
    AssistantService,
    OllamaProvider,
    AiSettingsService,
    ContextService,
    ChatService,
    KnowledgeService,
    ConversationsService,
    ModelsService,
    ProfilesService,
  ],
  exports: [EmbeddingService, IndexerService, RetrievalService, AssistantService],
})
export class AiModule {}
