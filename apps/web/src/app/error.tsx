'use client';

import { useEffect } from 'react';

/**
 * Human-readable failure (§57). The stack stays in the console for whoever is
 * debugging; the screen shows a sentence and a digest that matches a server log
 * line, so "it broke" becomes a searchable identifier.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="anim-enter w-full max-w-[420px] rounded border border-line bg-[var(--surface-raised)] p-5">
        <h1 className="label mb-2">Something went wrong</h1>
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          This screen failed to load. Nothing was lost — try again, and if it keeps happening the
          reference below will be in the API log.
        </p>
        {error.digest && (
          <p className="mono mt-3 text-[11px] text-[var(--text-faint)]">error {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 inline-flex h-[30px] items-center rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] px-[11px] text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
