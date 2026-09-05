import type { AiProviderKind } from '@prisma/client';

/**
 * What the console needs from an engine (§33).
 *
 * One implementation today, `OllamaProvider`. The interface is not speculation
 * about a second one: it is where the console's vocabulary is written down, so
 * the chat service can be read without knowing what an Ollama tag response
 * looks like. Adding OpenAI later means writing this shape and nothing else.
 */
export interface AiProvider {
  readonly kind: AiProviderKind;
  /** Where it is, shown to the user when it cannot be reached. */
  readonly endpoint: string;
  /** True when the engine runs on hardware the user controls (§32). */
  readonly isLocal: boolean;

  status(): Promise<ProviderStatus>;
  listModels(): Promise<ModelSummary[]>;
  /** Everything the server knows about one model. Null when it is not there. */
  describe(model: string): Promise<ModelDetail | null>;
  chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  embed(texts: string[], model: string): Promise<number[][]>;
  pull(model: string, signal?: AbortSignal): AsyncIterable<PullProgress>;
  remove(model: string): Promise<void>;
}

/** ONLINE, OFFLINE and ERROR from §5. LOADING is a per-model state. */
export type ProviderState = 'ONLINE' | 'OFFLINE' | 'ERROR';

export interface ProviderStatus {
  state: ProviderState;
  endpoint: string;
  /** The engine's own version string, when it offers one. */
  version: string | null;
  /** Present only when the state is not ONLINE. Already user-facing prose. */
  message: string | null;
  /** Round trip to the engine, in milliseconds. */
  latencyMs: number | null;
}

/**
 * A model as the server describes it. Every field after `name` is optional
 * because §5 forbids inventing metadata: a server that does not report a
 * parameter count gets a blank, not a guess.
 */
export interface ModelSummary {
  name: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  family: string | null;
  modifiedAt: string | null;
  /** True while the model is held in memory and answers without a cold read. */
  loaded: boolean;
}

export interface ModelDetail extends ModelSummary {
  contextLength: number | null;
  embeddingLength: number | null;
  /** Capabilities the server reports, e.g. `completion`, `embedding`, `tools`. */
  capabilities: string[];
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatTurn[];
  temperature?: number | null;
  topP?: number | null;
  topK?: number | null;
  /** Engine-side context window, in tokens. */
  contextLength?: number | null;
  maxTokens?: number | null;
  repeatPenalty?: number | null;
}

/**
 * One step of a streamed answer. `text` is empty on the final chunk, which
 * carries the counts instead — that is the only place they are truthful.
 */
export interface ChatChunk {
  text: string;
  done: boolean;
  promptTokens?: number;
  completionTokens?: number;
  /** Total generation time in milliseconds, as reported by the engine. */
  durationMs?: number;
}

export interface PullProgress {
  status: string;
  completedBytes: number | null;
  totalBytes: number | null;
  done: boolean;
}

/**
 * A failure the user is meant to read.
 *
 * Carries the shape of the problem rather than a status code, because the
 * console shows a different recovery for each: §45 offers "is Ollama running?"
 * for UNREACHABLE and "choose another model" for MODEL_MISSING.
 */
export class ProviderError extends Error {
  constructor(
    readonly reason:
      'UNREACHABLE' | 'MODEL_MISSING' | 'OUT_OF_MEMORY' | 'TIMEOUT' | 'CANCELLED' | 'SERVER',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
