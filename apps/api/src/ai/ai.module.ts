import { Global, Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SearchModule } from '../search/search.module';
import { AiController } from './ai.controller';
import { AssistantService } from './assistant.service';
import { EmbeddingService } from './embedding.service';
import { IndexerService } from './indexer.service';
import { RetrievalService } from './retrieval.service';

/**
 * Phase 6. Everything here degrades rather than fails: with no keys at all the
 * index still builds, search still returns passages, and only the written
 * answer is missing.
 *
 * Global because indexing is cross-cutting — six modules write records that
 * belong in the index, and having each of them import this one would say
 * nothing except that indexing exists.
 */
@Global()
@Module({
  imports: [StorageModule, SearchModule],
  controllers: [AiController],
  providers: [EmbeddingService, IndexerService, RetrievalService, AssistantService],
  exports: [EmbeddingService, IndexerService, RetrievalService, AssistantService],
})
export class AiModule {}
