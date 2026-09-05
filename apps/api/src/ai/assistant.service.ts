import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pathFor } from '../search/search.service';
import { plural } from '../common/text';
import { RetrievalService, type Passage } from './retrieval.service';
import { EmbeddingService } from './embedding.service';
import { routeStructured, type StructuredRow } from './structured';

export interface Citation {
  index: number;
  entityType: EntityType;
  entityId: string;
  title: string;
  href: string;
  excerpt: string;
  score: number;
}

export interface Answer {
  question: string;
  /** `records` came from a query; `knowledge` came from what you wrote. */
  mode: 'records' | 'knowledge';
  headline: string;
  /** Prose from the model. Null whenever generation is off or unavailable. */
  prose: string | null;
  generatedBy: string | null;
  citations: Citation[];
  rows: StructuredRow[];
  /** Said plainly rather than dressed up, when there is nothing to say. */
  note: string | null;
}

const SYSTEM = `You answer questions using only the numbered sources supplied with each question. Those sources are one developer's own notes, solutions, decision records and meeting notes.

Rules:
- Use only the sources. If they do not answer the question, say exactly that and stop. Never fill a gap from general knowledge, and never guess.
- Cite with bracketed numbers, like [2], immediately after the claim they support. Every factual sentence needs one.
- Answer in at most 150 words. Be direct and concrete. No preamble, no "based on the provided context", no summary of what you are about to do.
- Prefer the user's own wording, commands and file paths verbatim over paraphrase.
- If sources disagree, say so and cite both.
- Write in plain prose. No headings.`;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly generationEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly embeddings: EmbeddingService,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('ai.apiKey') ?? '';
    this.model = config.get<string>('ai.model') ?? '';
    this.generationEnabled = Boolean(config.get<boolean>('ai.enabled')) && Boolean(this.apiKey);
  }

  /** What the UI needs to describe itself honestly before anything is asked. */
  capabilities() {
    return {
      generation: this.generationEnabled,
      generationModel: this.generationEnabled ? this.model : null,
      embeddingModel: this.embeddings.model,
      // `lexical` means it matches words; `semantic` means it matches meaning.
      // The console tells the user which, because it changes what to ask.
      matching: this.embeddings.kind,
    };
  }

  async ask(
    userId: string,
    question: string,
    options: { projectId?: string } = {},
  ): Promise<Answer> {
    const trimmed = question.trim();

    // Structured first. A question with an exact answer should never be routed
    // through a paraphrase (§34).
    const intent = routeStructured(trimmed);
    if (intent && !options.projectId) {
      const result = await intent.run(this.prisma, userId);
      return {
        question: trimmed,
        mode: 'records',
        headline: result.rows.length ? result.headline : result.empty,
        prose: null,
        generatedBy: null,
        citations: [],
        rows: result.rows,
        note: result.rows.length ? null : result.empty,
      };
    }

    const passages = await this.retrieval.search(userId, trimmed, {
      limit: 6,
      projectId: options.projectId,
    });
    const citations = passages.map(toCitation);

    if (passages.length === 0) {
      return {
        question: trimmed,
        mode: 'knowledge',
        headline: 'Nothing in your notes covers this',
        prose: null,
        generatedBy: null,
        citations: [],
        rows: [],
        note:
          this.embeddings.kind === 'lexical'
            ? 'Matching is on words, not meaning — try the terms you would have written at the time.'
            : 'Nothing indexed came close enough to be worth showing.',
      };
    }

    if (!this.generationEnabled) {
      // Retrieval without generation is still the useful half: it finds the
      // record. Saying so is better than an apology for a missing API key.
      return {
        question: trimmed,
        mode: 'knowledge',
        headline: `${plural(citations.length, 'passage')} from your own notes`,
        prose: null,
        generatedBy: null,
        citations,
        rows: [],
        note: 'Written answers are off. These are the passages themselves, unedited.',
      };
    }

    const prose = await this.generate(trimmed, passages).catch((caught: Error) => {
      this.logger.warn(`Generation failed: ${caught.message}`);
      return null;
    });

    return {
      question: trimmed,
      mode: 'knowledge',
      headline: prose
        ? 'From your own notes'
        : `${plural(citations.length, 'passage')} from your own notes`,
      prose,
      generatedBy: prose ? this.model : null,
      citations,
      rows: [],
      note: prose ? null : 'The model could not be reached, so here are the passages themselves.',
    };
  }

  /**
   * Calls Claude with the retrieved passages and nothing else.
   *
   * What is not sent matters as much as what is: vault items are never
   * indexed, so no ciphertext, no secret and no master password can reach this
   * request (§43). The passages are the user's own prose, and the prompt says
   * to answer from them alone.
   *
   * `fetch` rather than the SDK — this is one POST, and a dependency whose only
   * job is to build one POST is a dependency to maintain for nothing.
   */
  private async generate(question: string, passages: Passage[]): Promise<string> {
    const context = passages
      .map((passage, index) => `[${index + 1}] ${passage.title}\n${passage.content}`)
      .join('\n\n---\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: `${context}\n\n---\n\nQuestion: ${question}` }],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      // The status, never the body: an upstream error can echo the request.
      throw new Error(`The model returned ${response.status}.`);
    }
    const body = (await response.json()) as { content: { type: string; text?: string }[] };
    return body.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();
  }

  /** "Have I hit this before?" — §35's similar-solution search. */
  async similar(userId: string, text: string, exclude?: string): Promise<Citation[]> {
    return (await this.retrieval.similarSolutions(userId, text, exclude)).map(toCitation);
  }
}

function toCitation(passage: Passage, index: number): Citation {
  return {
    index: index + 1,
    entityType: passage.entityType,
    entityId: passage.entityId,
    title: passage.title,
    href: pathFor(passage.entityType, passage.entityId),
    // Long enough to judge relevance, short enough not to become the answer.
    excerpt: passage.content.length > 420 ? `${passage.content.slice(0, 420)}…` : passage.content,
    score: Number(passage.score.toFixed(3)),
  };
}
