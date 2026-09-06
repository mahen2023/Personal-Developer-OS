'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  type AiMessage,
  type AiMode,
  type AiSource,
  type Conversation,
  streamEvents,
} from '@/lib/intelligence';

/** The turn currently being generated, before it becomes an AiMessage. */
export interface Pending {
  question: string;
  answer: string;
  model: string;
  sources: AiSource[];
  startedAt: number;
}

export interface ConsoleError {
  reason: string;
  message: string;
}

/**
 * The console's state (§12).
 *
 * One rule drives the shape of this: the answer being written is not a message
 * yet. It has no id, it is not in the database, and it changes on every token —
 * so it lives beside the message list rather than being spliced into it. When
 * the stream finishes it is replaced wholesale by the stored row, which is the
 * only version that has an id to save, regenerate or cite from.
 */
export function useConsole(conversationId: string | null) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<ConsoleError | null>(null);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const [record, page] = await Promise.all([
      api<Conversation>(`/ai/conversations/${id}`).catch(() => null),
      api<{ items: AiMessage[]; hasMore: boolean }>(`/ai/conversations/${id}/messages`).catch(
        () => ({ items: [], hasMore: false }),
      ),
    ]);
    setConversation(record);
    setMessages(page.items);
    setHasMore(page.hasMore);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setPending(null);
      return;
    }
    void load(conversationId);
  }, [conversationId, load]);

  /** Older turns, fetched only when the developer scrolls for them (§58). */
  const loadOlder = useCallback(async () => {
    const oldest = messages[0];
    if (!conversationId || !oldest) return;
    const page = await api<{ items: AiMessage[]; hasMore: boolean }>(
      `/ai/conversations/${conversationId}/messages?before=${oldest.id}`,
    ).catch(() => null);
    if (!page) return;
    setMessages((current) => [...page.items, ...current]);
    setHasMore(page.hasMore);
  }, [conversationId, messages]);

  const send = useCallback(
    async (
      text: string,
      options: { model?: string; mode?: AiMode; fromMessageId?: string; profileId?: string } = {},
    ) => {
      if (!conversationId || !text.trim()) return;

      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setPending({
        question: text.trim(),
        answer: '',
        model: options.model ?? conversation?.model ?? '',
        sources: [],
        startedAt: Date.now(),
      });

      try {
        for await (const event of streamEvents(
          `/ai/conversations/${conversationId}/messages`,
          { message: text.trim(), ...options },
          controller.signal,
        )) {
          if (event.type === 'meta') {
            setPending((current) =>
              current ? { ...current, model: event.model, sources: event.sources } : current,
            );
            setConversation((current) =>
              current ? { ...current, title: event.title, model: event.model } : current,
            );
          } else if (event.type === 'token') {
            setPending((current) =>
              current ? { ...current, answer: current.answer + event.text } : current,
            );
          } else if (event.type === 'error') {
            setError({ reason: event.reason, message: event.message });
          }
        }
      } catch (caught) {
        // An abort is the stop button, not a failure. Anything else is.
        if (!controller.signal.aborted) {
          setError({
            reason: 'SERVER',
            message:
              caught instanceof ApiError ? caught.message : 'The console lost its connection.',
          });
        }
      } finally {
        abort.current = null;
        setPending(null);
        // Re-read rather than appending what we streamed: the stored row is the
        // one with an id, timings and token counts, and it is what every
        // message action needs.
        await load(conversationId);
      }
    },
    [conversationId, conversation?.model, load],
  );

  /** §12's stop, and §52's Escape. */
  const stop = useCallback(() => abort.current?.abort(), []);

  const update = useCallback(
    async (patch: Partial<Conversation>) => {
      if (!conversationId) return;
      const updated = await api<Conversation>(`/ai/conversations/${conversationId}`, {
        method: 'PATCH',
        body: patch,
      }).catch(() => null);
      if (updated) {
        setConversation(updated);
        // A model switch writes a marker into the transcript (§54), so the
        // list has to be re-read to show it.
        if (patch.model) await load(conversationId);
      }
    },
    [conversationId, load],
  );

  return {
    conversation,
    messages,
    hasMore,
    pending,
    error,
    loading,
    streaming: pending !== null,
    send,
    stop,
    update,
    reload: () => (conversationId ? load(conversationId) : undefined),
    loadOlder,
    dismissError: () => setError(null),
  };
}
