import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DIMENSIONS, type Embedder, localEmbedder, openAiEmbedder } from './embedding';

/** Enough per request to be efficient, small enough not to trip a body limit. */
const BATCH = 64;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly provider: Embedder;

  constructor(config: ConfigService) {
    const name = config.get<string>('ai.embeddingProvider');
    const key = config.get<string>('ai.embeddingKey') ?? '';

    if (name === 'openai' && key) {
      this.provider = openAiEmbedder(key, config.get<string>('ai.embeddingModel') ?? '');
    } else {
      if (name === 'openai') {
        this.logger.warn('EMBEDDING_PROVIDER is openai but OPENAI_API_KEY is empty — using local.');
      }
      this.provider = localEmbedder;
    }
    this.logger.log(`Embeddings: ${this.provider.model} (${this.provider.kind}, ${DIMENSIONS}d)`);
  }

  get model(): string {
    return this.provider.model;
  }

  /** `lexical` matches words, `semantic` matches meaning. The UI says which. */
  get kind(): 'lexical' | 'semantic' {
    return this.provider.kind;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let index = 0; index < texts.length; index += BATCH) {
      results.push(...(await this.provider.embed(texts.slice(index, index + BATCH))));
    }
    return results;
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.provider.embed([text]);
    return vector;
  }
}
