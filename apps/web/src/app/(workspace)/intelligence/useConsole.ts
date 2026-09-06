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
  /** True while a dropped stream is being retried, so the UI can say so. */
  reconnecting?: boolean;
}

export interface ConsoleError {
  reason: string;
  message: string;
}

export interface SendOptions {
  model?: string;
  mode?: AiMode;
  /** Rewind to this message and ask from there — regenerate and edit both. */
  fromMessageId?: string;
  profileId?: string;
}

/**
 * The console's state (§12).
 *
 * One rule drives the shape of this: the answer being written is not a message
 * yet. It has no id, it is not in the database, and it changes on every token —
 * so it lives beside the message list rather than being spliced into it. When
 * the stream finishes it is replaced wholesale by the stored row, which is the
 * only version that has an id to save, regenerate or cite from.
 *
 * Two further rules keep the actions reliable, both learned from them not being:
 *
 *   A refresh is not a load. Re-reading the transcript after a send used to
 *   raise `loading`, which unmounted the whole transcript and every piece of
 *   local state inside it — a half-typed edit, an open save panel, the button
 *   about to be clicked again. `loading` is now only true when moving to a
 *   different conversation, where there genuinely is nothing on screen yet.
 *
 *   One stream at a time. Clicking regenerate while an answer was arriving
 *   started a second stream whose events fought the first, and whose cleanup
 *   cleared the other's state on the way out. A new send stops the old one and
 *   ignores anything that arrives from it afterwards.
 */
export function useConsole(conversationId: string | null) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<ConsoleError | null>(null);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);
  /** Increments per send; a stale stream compares against it and stays quiet. */
  const run = useRef(0);

  const read = useCallback(async (id: string, showLoading: boolean) => {
    if (showLoading) setLoading(true);
    const [record, page] = await Promise.all([
      api<Conversation>(`/ai/conversations/${id}`).catch(() => null),
      api<{ items: AiMessage[]; hasMore: boolean }>(`/ai/conversations/${id}/messages`).catch(
        () => ({ items: [], hasMore: false }),
      ),
    ]);
    setConversation(record);
    setMessages(page.items);
    setHasMore(page.hasMore);
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    // Leaving a conversation stops its stream: the tokens have nowhere to go.
    abort.current?.abort();
    run.current += 1;
    setPending(null);
    setError(null);

    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      return;
    }
    void read(conversationId, true);
  }, [conversationId, read]);

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

  /**
   * Runs one turn.
   *
   * Resolves false when nothing was generated, so the caller can put the
   * developer's text back where they typed it rather than losing it to a
   * connection that dropped.
   */
  const send = useCallback(
    async (text: string, options: SendOptions = {}): Promise<boolean> => {
      const question = text.trim();
      if (!conversationId || !question) return false;

      // Whatever was running is finished with.
      abort.current?.abort();
      const ticket = (run.current += 1);
      const current = (): boolean => run.current === ticket;

      const controller = new AbortController();
      abort.current = controller;
      setError(null);
      setPending({
        question,
        answer: '',
        model: options.model ?? conversation?.model ?? '',
        sources: [],
        startedAt: Date.now(),
      });

      // One silent retry, and only before a single token has arrived. Re-asking
      // after the model has begun would either duplicate an answer the reader
      // has already seen or replace it mid-sentence; before that, nothing has
      // been shown and a dropped connection is worth simply trying again.
      let attempt = 0;
      let delivered = false;
      let failure: ConsoleError | null = null;

      for (;;) {
        try {
          for await (const event of streamEvents(
            `/ai/conversations/${conversationId}/messages`,
            { message: question, ...options },
            controller.signal,
          )) {
            if (!current()) return false;

            if (event.type === 'meta') {
              setPending((state) =>
                state
                  ? { ...state, model: event.model, sources: event.sources, reconnecting: false }
                  : state,
              );
              setConversation((state) =>
                state ? { ...state, title: event.title, model: event.model } : state,
              );
            } else if (event.type === 'token') {
              delivered = true;
              setPending((state) =>
                state ? { ...state, answer: state.answer + event.text } : state,
              );
            } else if (event.type === 'error') {
              failure = { reason: event.reason, message: event.message };
            }
          }
          break;
        } catch (caught) {
          // An abort is the stop button or a switch away, never a fault.
          if (controller.signal.aborted || !current()) return false;

          if (!delivered && attempt === 0) {
            attempt += 1;
            setPending((state) => (state ? { ...state, reconnecting: true } : state));
            await new Promise((resolve) => window.setTimeout(resolve, 900));
            if (!current() || controller.signal.aborted) return false;
            continue;
          }

          failure = {
            reason: 'SERVER',
            message:
              caught instanceof ApiError
                ? caught.message
                : 'The connection dropped before the answer finished.',
          };
          break;
        }
      }

      if (!current()) return false;
      abort.current = null;
      setPending(null);
      if (failure) setError(failure);

      // Re-read rather than keeping what was streamed: the stored row is the
      // one with an id, timings and token counts, and every message action
      // needs it. Deliberately without `loading` — see the note above.
      await read(conversationId, false);
      return !failure;
    },
    [conversationId, conversation?.model, read],
  );

  /** §12's stop, and §52's Escape. */
  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    run.current += 1;
    setPending(null);
    // The partial answer is saved server-side, so it is read back rather than
    // dropped: stopping keeps what was written, it does not undo it.
    if (conversationId) void read(conversationId, false);
  }, [conversationId, read]);

  const update = useCallback(
    async (patch: Partial<Conversation>) => {
      if (!conversationId) return;
      // Optimistic: switching model or mode should feel instant, and the
      // request that follows only confirms it (§29, §54).
      setConversation((state) => (state ? { ...state, ...patch } : state));
      const updated = await api<Conversation>(`/ai/conversations/${conversationId}`, {
        method: 'PATCH',
        body: patch,
      }).catch(() => null);
      if (!updated) return;
      setConversation(updated);
      // A model change writes a marker into the transcript (§54).
      if (patch.model) await read(conversationId, false);
    },
    [conversationId, read],
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
    reload: () => (conversationId ? read(conversationId, false) : undefined),
    loadOlder,
    dismissError: () => setError(null),
  };
}
