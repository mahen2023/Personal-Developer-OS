import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderKind } from '@prisma/client';
import {
  type AiProvider,
  type ChatChunk,
  type ChatRequest,
  type ModelDetail,
  type ModelSummary,
  ProviderError,
  type ProviderStatus,
  type PullProgress,
} from './ai-provider.interface';

/**
 * Ollama, reached over its HTTP API (§35).
 *
 * Every request to Ollama in this application goes through this class. That is
 * the whole point of it: `/api/tags` returning `models` while `/api/ps` returns
 * the same field with different contents is Ollama's business, and nothing
 * above this file should have to know it.
 *
 * `fetch` rather than the official client — these are six endpoints returning
 * JSON, and a dependency whose job is to build six requests is a dependency to
 * keep up to date for nothing. It also keeps streaming honest: Ollama emits
 * newline-delimited JSON, which is read directly off the body here.
 */
@Injectable()
export class OllamaProvider implements AiProvider {
  readonly kind = AiProviderKind.OLLAMA;
  readonly isLocal = true;

  private readonly logger = new Logger(OllamaProvider.name);
  private readonly configuredUrl: string;
  private readonly timeoutMs: number;
  /** Overridden per user by AiSetting.baseUrl; see `withBaseUrl`. */
  private override: string | null = null;

  constructor(config: ConfigService) {
    this.configuredUrl = config.get<string>('ollama.baseUrl') ?? 'http://localhost:11434';
    this.timeoutMs = config.get<number>('ollama.timeoutMs') ?? 120_000;
  }

  get endpoint(): string {
    return this.override ?? this.configuredUrl;
  }

  /**
   * A copy pointed at another server.
   *
   * The setting is per user and this provider is a singleton, so mutating
   * `this` would let one request move another request's endpoint. A shallow
   * clone costs nothing and cannot.
   */
  withBaseUrl(baseUrl: string | null | undefined): OllamaProvider {
    if (!baseUrl || baseUrl === this.endpoint) return this;
    const copy = Object.create(this) as OllamaProvider;
    copy.override = baseUrl.replace(/\/+$/, '');
    return copy;
  }

  async status(): Promise<ProviderStatus> {
    const started = Date.now();
    try {
      // `/api/version` rather than `/api/tags`: it answers before any model is
      // read, so a server with a cold 14B model still reports ONLINE promptly.
      const response = await this.request('/api/version', { timeoutMs: 5_000 });
      const body = (await response.json()) as { version?: string };
      return {
        state: 'ONLINE',
        endpoint: this.endpoint,
        version: body.version ?? null,
        message: null,
        latencyMs: Date.now() - started,
      };
    } catch (caught) {
      const error = asProviderError(caught);
      return {
        state: error.reason === 'UNREACHABLE' || error.reason === 'TIMEOUT' ? 'OFFLINE' : 'ERROR',
        endpoint: this.endpoint,
        version: null,
        message: error.message,
        latencyMs: null,
      };
    }
  }

  async listModels(): Promise<ModelSummary[]> {
    const [installed, running] = await Promise.all([
      this.json<{ models?: OllamaTag[] }>('/api/tags'),
      // Which models are in memory. A failure here is not a failure of the
      // list — older servers have no /api/ps, and "loaded" is a nicety.
      this.json<{ models?: { name?: string; model?: string }[] }>('/api/ps').catch(() => ({
        models: [],
      })),
    ]);

    const loaded = new Set((running.models ?? []).map((row) => row.model ?? row.name ?? ''));
    return (installed.models ?? [])
      .map((row) => toSummary(row, loaded))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async describe(model: string): Promise<ModelDetail | null> {
    const [summary, detail] = await Promise.all([
      this.listModels().then((models) => models.find((row) => row.name === model) ?? null),
      this.json<OllamaShow>('/api/show', { method: 'POST', body: { model } }).catch(() => null),
    ]);
    if (!summary && !detail) return null;

    const info = detail?.model_info ?? {};
    // Ollama keys architecture-specific fields by family — `llama.context_length`,
    // `qwen2.context_length` — so the family prefix has to be discovered.
    const pick = (suffix: string): number | null => {
      const key = Object.keys(info).find((name) => name.endsWith(`.${suffix}`));
      const value = key ? info[key] : undefined;
      return typeof value === 'number' ? value : null;
    };

    return {
      name: model,
      sizeBytes: summary?.sizeBytes ?? null,
      parameterSize: summary?.parameterSize ?? detail?.details?.parameter_size ?? null,
      quantization: summary?.quantization ?? detail?.details?.quantization_level ?? null,
      family: summary?.family ?? detail?.details?.family ?? null,
      modifiedAt: summary?.modifiedAt ?? null,
      loaded: summary?.loaded ?? false,
      contextLength: pick('context_length'),
      embeddingLength: pick('embedding_length'),
      capabilities: detail?.capabilities ?? [],
    };
  }

  /**
   * Streams an answer as Ollama produces it.
   *
   * Ollama replies with newline-delimited JSON, one object per token batch. The
   * final object carries the counts and timings and no text, which is why they
   * are only trusted from the chunk whose `done` is true.
   */
  async *chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    // The timeout is silence, not duration. An absolute AbortSignal.timeout
    // covers the whole stream, so it cut a working answer off mid-sentence the
    // moment the model was asked something long — which from the browser is
    // indistinguishable from the connection dropping, because it is one.
    const watch = watchdog(this.timeoutMs, signal);

    try {
      const response = await this.request('/api/chat', {
        method: 'POST',
        signal: watch.signal,
        userSignal: signal,
        timeoutMs: 0,
        body: {
          model: request.model,
          messages: request.messages,
          stream: true,
          options: options(request),
        },
      });

      for await (const row of ndjson<OllamaChatChunk>(response, signal, watch.touch)) {
        if (row.error) throw classify(row.error, request.model);
        const text = row.message?.content ?? '';
        if (row.done) {
          yield {
            text,
            done: true,
            promptTokens: row.prompt_eval_count,
            completionTokens: row.eval_count,
            durationMs: row.total_duration ? Math.round(row.total_duration / 1e6) : undefined,
          };
          return;
        }
        if (text) yield { text, done: false };
      }
    } catch (caught) {
      if (watch.timedOut && !signal?.aborted) {
        throw new ProviderError(
          'TIMEOUT',
          `${request.model} sent nothing for ${Math.round(this.timeoutMs / 1000)}s. It may have run out of memory, or OLLAMA_TIMEOUT_MS may be too tight for a model this cold.`,
        );
      }
      throw caught;
    } finally {
      watch.done();
    }
  }

  async embed(texts: string[], model: string): Promise<number[][]> {
    const body = await this.json<{ embeddings?: number[][] }>('/api/embed', {
      method: 'POST',
      body: { model, input: texts },
    });
    const vectors = body.embeddings ?? [];
    if (vectors.length !== texts.length) {
      throw new ProviderError(
        'SERVER',
        `${model} returned ${vectors.length} vectors for ${texts.length} inputs.`,
      );
    }
    return vectors;
  }

  /** Download progress, as it happens. The caller decides what to do with it. */
  async *pull(model: string, signal?: AbortSignal): AsyncIterable<PullProgress> {
    // Silence again, rather than duration: an 11 GB download is not a stuck
    // request, but ten minutes with no progress line is.
    const watch = watchdog(PULL_IDLE_MS, signal);
    const response = await this.request('/api/pull', {
      method: 'POST',
      signal: watch.signal,
      userSignal: signal,
      timeoutMs: 0,
      body: { model, stream: true },
    });

    for await (const row of ndjson<OllamaPull>(response, signal, watch.touch)) {
      if (row.error) throw classify(row.error, model);
      yield {
        status: row.status ?? 'working',
        completedBytes: row.completed ?? null,
        totalBytes: row.total ?? null,
        done: row.status === 'success',
      };
    }
    watch.done();
  }

  async remove(model: string): Promise<void> {
    await this.request('/api/delete', { method: 'DELETE', body: { model } });
    this.logger.warn(`Deleted Ollama model ${model}`);
  }

  /* ── transport ─────────────────────────────────────────────────────────── */

  private async json<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    return (await (await this.request(path, init)).json()) as T;
  }

  private async request(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      signal?: AbortSignal;
      timeoutMs?: number;
      /** The stop button, when it differs from `signal` — see `watchdog`. */
      userSignal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    const timeoutMs = init.timeoutMs ?? this.timeoutMs;
    // Two signals, one request: the caller's stop button and our own timeout.
    const timeout = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    const signal =
      init.signal && timeout ? AbortSignal.any([init.signal, timeout]) : (init.signal ?? timeout);
    const stopped = init.userSignal ?? init.signal;

    let response: Response;
    try {
      response = await fetch(`${this.endpoint}${path}`, {
        method: init.method ?? 'GET',
        headers: init.body ? { 'content-type': 'application/json' } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal,
      });
    } catch (caught) {
      // A stop is the user's decision, not a fault, and must not be reported
      // as one — it is the difference between a message and a red banner.
      if (stopped?.aborted) throw new ProviderError('CANCELLED', 'Generation stopped.');
      if ((caught as Error).name === 'TimeoutError' || (caught as Error).name === 'AbortError') {
        throw new ProviderError(
          'TIMEOUT',
          `Ollama did not respond within ${Math.round(timeoutMs / 1000)}s. A model this size may need longer than OLLAMA_TIMEOUT_MS allows.`,
        );
      }
      throw new ProviderError(
        'UNREACHABLE',
        `Cannot reach Ollama at ${this.endpoint}. Is it running?`,
      );
    }

    if (!response.ok) {
      // Ollama puts a readable sentence in `error`; anything else is a status.
      const text = await response.text().catch(() => '');
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {
        /* not JSON — the raw body is the best we have */
      }
      throw classify(message || `Ollama returned ${response.status}.`, undefined, response.status);
    }
    return response;
  }
}

/* ── wire shapes ───────────────────────────────────────────────────────────── */

interface OllamaTag {
  name?: string;
  model?: string;
  size?: number;
  modified_at?: string;
  details?: { parameter_size?: string; quantization_level?: string; family?: string };
}

interface OllamaShow {
  capabilities?: string[];
  details?: { parameter_size?: string; quantization_level?: string; family?: string };
  model_info?: Record<string, unknown>;
}

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  /** Nanoseconds, which is why nothing downstream sees this field directly. */
  total_duration?: number;
}

interface OllamaPull {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
}

function toSummary(row: OllamaTag, loaded: Set<string>): ModelSummary {
  const name = row.model ?? row.name ?? '';
  return {
    name,
    sizeBytes: row.size ?? null,
    parameterSize: row.details?.parameter_size ?? null,
    quantization: row.details?.quantization_level ?? null,
    family: row.details?.family ?? null,
    modifiedAt: row.modified_at ?? null,
    loaded: loaded.has(name),
  };
}

function options(request: ChatRequest): Record<string, number> {
  // Only what was actually set. Sending `temperature: null` is not the same as
  // not sending it, and §24 says not to show a control that does nothing.
  const out: Record<string, number> = {};
  if (request.temperature != null) out.temperature = request.temperature;
  if (request.topP != null) out.top_p = request.topP;
  if (request.topK != null) out.top_k = request.topK;
  if (request.contextLength != null) out.num_ctx = request.contextLength;
  if (request.maxTokens != null) out.num_predict = request.maxTokens;
  if (request.repeatPenalty != null) out.repeat_penalty = request.repeatPenalty;
  return out;
}

/**
 * Turns Ollama's prose into something the console can act on (§45).
 *
 * The strings are matched rather than parsed because Ollama has no error codes;
 * an unrecognised message still becomes a SERVER error carrying its own text,
 * so a new failure mode is shown to the user rather than swallowed.
 */
export function classify(message: string, model?: string, httpStatus?: number): ProviderError {
  const text = message.toLowerCase();
  if (text.includes('not found') || text.includes('try pulling') || httpStatus === 404) {
    return new ProviderError(
      'MODEL_MISSING',
      model
        ? `${model} is not installed on this Ollama server. Pull it, or choose another model.`
        : message,
    );
  }
  if (text.includes('memory') || text.includes('cudamalloc') || text.includes('vram')) {
    return new ProviderError(
      'OUT_OF_MEMORY',
      `${model ?? 'That model'} does not fit in this machine's memory. Try a smaller model or a lower quantisation.`,
    );
  }
  return new ProviderError('SERVER', message);
}

/** Ten minutes with no progress line means a download really has stalled. */
const PULL_IDLE_MS = 600_000;

/**
 * A deadline that resets every time something arrives.
 *
 * `AbortSignal.timeout` cannot express this: it fires a fixed time after it is
 * created, which is right for a request that should return once and wrong for a
 * stream meant to keep going.
 *
 * The caller's own signal is chained in so a stop still stops, and `timedOut`
 * records which of the two fired — "you stopped this" and "the model went
 * quiet" are not the same message.
 */
export function watchdog(
  ms: number,
  signal?: AbortSignal,
): { signal: AbortSignal; touch: () => void; done: () => void; readonly timedOut: boolean } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const done = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const touch = (): void => {
    done();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
    // A pending timer keeps Node alive; this one must never be why a worker
    // refuses to shut down.
    timer.unref?.();
  };

  signal?.addEventListener('abort', () => {
    done();
    controller.abort();
  });

  if (ms > 0) touch();
  return {
    signal: controller.signal,
    touch,
    done,
    get timedOut() {
      return timedOut;
    },
  };
}

function asProviderError(caught: unknown): ProviderError {
  return caught instanceof ProviderError
    ? caught
    : new ProviderError('SERVER', (caught as Error).message);
}

/**
 * Newline-delimited JSON off a streaming body.
 *
 * A chunk boundary lands anywhere, including the middle of a UTF-8 character
 * and the middle of a line, so bytes are decoded with `stream: true` and the
 * tail is held back until its newline arrives.
 */
async function* ndjson<T>(
  response: Response,
  signal?: AbortSignal,
  touch?: () => void,
): AsyncIterable<T> {
  const body = response.body;
  if (!body) throw new ProviderError('SERVER', 'Ollama sent an empty response.');

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Anything arriving counts as alive, including a chunk that does not yet
      // complete a line.
      touch?.();
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
        newline = buffer.indexOf('\n');
      }
    }
    const rest = buffer.trim();
    if (rest) yield JSON.parse(rest) as T;
  } catch (caught) {
    if (signal?.aborted) throw new ProviderError('CANCELLED', 'Generation stopped.');
    throw new ProviderError('SERVER', `The stream from Ollama broke: ${(caught as Error).message}`);
  } finally {
    // Releasing matters on the stop path: without it the socket stays open and
    // Ollama keeps generating into a response nobody is reading.
    await reader.cancel().catch(() => undefined);
  }
}
