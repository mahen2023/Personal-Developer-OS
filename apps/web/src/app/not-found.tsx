import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded border border-line bg-[var(--surface-raised)] p-5">
        <h1 className="label mb-2">Nothing at this address</h1>
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          The record may have been deleted, or the link may be stale. Press{' '}
          <span className="mono">⌘K</span> to search for it.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex h-[30px] items-center rounded border border-line bg-[var(--surface-base)] px-[11px] text-[12px] transition-colors hover:border-[var(--line-strong)]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
