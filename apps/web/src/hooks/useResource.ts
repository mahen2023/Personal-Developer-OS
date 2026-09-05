'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import type { Paged } from '@/lib/types';

/**
 * List state lives in the URL, not in React.
 *
 * That is what makes a filtered view shareable, bookmarkable and survivable
 * across a refresh — and it means the back button does the obvious thing after
 * drilling into a record.
 */
/**
 * Parameters that steer the UI but mean nothing to the API. They stay in the
 * URL — a shared link should reopen the same view — but are stripped from the
 * request, because the API validates strictly and rejects unknown fields.
 */
const UI_ONLY = new Set(['view']);

export function useListQuery(defaults: Record<string, string> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const values = useMemo(() => {
    const merged: Record<string, string> = { ...defaults };
    params.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      // Any filter change resets paging; staying on page 7 of a new filter
      // usually lands on an empty screen.
      if (!('page' in patch)) next.delete('page');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const queryString = useMemo(() => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value && !UI_ONLY.has(key)) search.set(key, value);
    }
    return search.toString();
  }, [values]);

  return { values, set, queryString };
}

export interface ListState<T> {
  data: Paged<T> | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Fetches a paginated list and re-fetches whenever the query string changes. */
export function useList<T>(path: string, queryString: string): ListState<T> {
  const [data, setData] = useState<Paged<T> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Paged<T>>(`${path}${queryString ? `?${queryString}` : ''}`)
      .then((result) => {
        // A slow first request must not overwrite a fast second one.
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, queryString, nonce]);

  return { data, error, loading, reload: () => setNonce((value) => value + 1) };
}

/** Fetches a single record. */
export function useRecord<T>(path: string | null): {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  set: (value: T) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return { data, error, loading, reload: () => setNonce((value) => value + 1), set: setData };
}

/**
 * Wraps a create/update/delete call with the two states every form needs:
 * "working" and "what went wrong".
 */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  busy: boolean;
  error: ApiError | null;
  clearError: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setBusy(true);
      setError(null);
      try {
        return await action(...args);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught : new ApiError('Something went wrong.', 0));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [action],
  );

  return { run, busy, error, clearError: () => setError(null) };
}
