import { ApiError } from '@/lib/api';
import type { ProjectRef } from '@/lib/types';

/* ── what the API says ────────────────────────────────────────────────────── */

export type AiMode =
  | 'GENERAL'
  | 'PROJECT'
  | 'TROUBLESHOOTING'
  | 'DOCUMENTATION'
  | 'CODE'
  | 'INFRASTRUCTURE'
  | 'KNOWLEDGE';

export type AiRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface AiSource {
  index: number;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  score: number;
  pinned: boolean;
  excerpt?: string;
  content?: string;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  role: AiRole;
  content: string;
  model: string | null;
  sources: AiSource[];
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  mode: AiMode;
  model: string;
  provider: string;
  projectId: string | null;
  project?: ProjectRef | null;
  sources: string[];
  attached: string[];
  isPinned: boolean;
  isArchived: boolean;
  messageCount?: number;
  lastMessageAt?: string;
  preview?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OllamaModel {
  name: string;
  sizeBytes: number | null;
  parameterSize: string | null;
  quantization: string | null;
  family: string | null;
  modifiedAt: string | null;
  loaded: boolean;
  useCount: number;
  lastUsedAt: string | null;
  isDefault: boolean;
}

export interface OllamaStatus {
  state: 'ONLINE' | 'OFFLINE' | 'ERROR';
  endpoint: string;
  version: string | null;
  message: string | null;
  latencyMs: number | null;
  placement: 'LOCAL' | 'REMOTE' | 'OFFLINE';
  privateMode: boolean;
  chatModel: string | null;
}

export interface AiSettings {
  provider: string;
  isLocal: boolean;
  endpoint: string;
  endpointSource: 'settings' | 'environment';
  chatModel: string | null;
  embeddingModel: string | null;
  defaultMode: AiMode;
  temperature: number | null;
  privateMode: boolean;
  retainMessages: boolean;
  indexEmbeddingModel: string;
  indexMatching: 'lexical' | 'semantic';
}

export interface ModeDefinition {
  mode: AiMode;
  label: string;
  hint: string;
  defaultSources: string[];
}

export interface Providers {
  providers: { kind: string; label: string; isLocal: boolean; endpoint: string }[];
  active: string;
  modes: ModeDefinition[];
  sources: string[];
  settings: AiSettings;
}

export interface ModelProfile {
  id: string;
  name: string;
  model: string;
  mode: AiMode;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  contextLength: number | null;
  systemPrompt: string | null;
  isDefault: boolean;
}

/* ── streaming ────────────────────────────────────────────────────────────── */

export type ChatEvent =
  | { type: 'meta'; conversationId: string; model: string; sources: AiSource[]; title: string }
  | { type: 'token'; text: string }
  | {
      type: 'done';
      messageId: string | null;
      durationMs: number;
      promptTokens: number | null;
      completionTokens: number | null;
      tokensPerSecond: number | null;
    }
  | { type: 'error'; reason: string; message: string }
  | {
      type: 'progress';
      status: string;
      completedBytes: number | null;
      totalBytes: number | null;
      done: boolean;
    };

/**
 * Reads a server-sent event stream from a POST (§37).
 *
 * `EventSource` cannot POST and cannot carry a body, so the stream is read off
 * `fetch` directly. The parsing is the whole reason this is one function rather
 * than inline in a component: a chunk boundary lands anywhere, including
 * mid-event and mid-character, so text is decoded with `stream: true` and only
 * complete `\n\n`-terminated frames are handed on.
 */
export async function* streamEvents(
  path: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      errorId?: string;
    };
    throw new ApiError(
      payload.message ?? 'The console could not start a response.',
      response.status,
      payload.errorId,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const data = frame.startsWith('data: ') ? frame.slice(6) : null;
        if (data) yield JSON.parse(data) as ChatEvent;
        split = buffer.indexOf('\n\n');
      }
    }
  } finally {
    // Cancelling releases the socket, which is what actually stops Ollama
    // generating — the abort alone only stops us listening.
    await reader.cancel().catch(() => undefined);
  }
}

/* ── presentation ─────────────────────────────────────────────────────────── */

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The record type a source came from, as the console labels it. */
export function sourceLabel(entityType: string): string {
  return entityType.replace(/_/g, ' ').toLowerCase();
}
