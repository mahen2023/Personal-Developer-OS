'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { cx } from '@/lib/format';

interface Props {
  mode: 'login' | 'register';
}

/**
 * Sign-in deliberately looks like a console session rather than a marketing
 * page — it is the first thing that says this is a workstation, not a SaaS.
 */
export function AuthPanel({ mode }: Props) {
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const body = isRegister
      ? {
          name: String(form.get('name')),
          email: String(form.get('email')),
          password: String(form.get('password')),
        }
      : { email: String(form.get('email')), password: String(form.get('password')) };

    try {
      await api(isRegister ? '/auth/register' : '/auth/login', { method: 'POST', body });
      // Read ?next here rather than with useSearchParams: that hook would opt
      // the whole page out of server rendering, and this form should paint
      // before hydration. Only same-origin paths are honoured, so the query
      // string cannot be used to bounce a signed-in user off-site.
      const next = new URLSearchParams(window.location.search).get('next');
      const destination = next && /^\/(?!\/)/.test(next) ? next : '/';
      // Full navigation, not router.push: the middleware must re-read the new
      // session cookie before the workspace shell mounts.
      window.location.href = destination;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError('Something went wrong.', 0));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-base)] p-6">
      <div className="anim-enter w-full max-w-[380px]">
        <div className="mb-5 flex items-baseline gap-2">
          <span
            aria-hidden
            className="mono flex h-[26px] w-[26px] items-center justify-center rounded-sm border border-[var(--accent-line)] bg-[var(--accent-dim)] text-[13px] font-bold text-[var(--accent)]"
          >
            /
          </span>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Developer OS</h1>
          <span className="mono ml-auto text-[11px] text-[var(--text-faint)]">
            {isRegister ? 'first run' : 'locked'}
            <span style={{ animation: 'caret 1.1s step-end infinite' }}>_</span>
          </span>
        </div>

        <form
          onSubmit={onSubmit}
          className="overflow-hidden rounded-lg border border-line bg-[var(--surface-raised)]"
        >
          <div className="label border-b border-line px-4 py-[9px]">
            {isRegister ? 'Create the owner account' : 'Sign in'}
          </div>

          <div className="flex flex-col gap-3 p-4">
            {isRegister && <Field name="name" label="Name" autoComplete="name" required />}
            <Field name="email" label="Email" type="email" autoComplete="email" required />
            <Field
              name="password"
              label="Password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              hint={
                isRegister ? 'At least 12 characters. Length matters more than symbols.' : undefined
              }
              required
            />

            {error && (
              <div
                role="alert"
                aria-label="Error"
                className="flex items-start gap-2 rounded border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-dim)] px-3 py-2"
              >
                <TriangleAlert size={13} className="mt-[2px] shrink-0 text-[var(--danger)]" />
                <div className="min-w-0">
                  <p className="text-[12.5px] text-[var(--text)]">{error.message}</p>
                  {error.details?.map((detail) => (
                    <p key={detail} className="text-[11.5px] text-[var(--text-muted)]">
                      {detail}
                    </p>
                  ))}
                  {error.errorId && (
                    <p className="mono mt-[2px] text-[10.5px] text-[var(--text-faint)]">
                      error {error.errorId}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className={cx(
                'mt-1 inline-flex h-[32px] items-center justify-center gap-2 rounded border border-[var(--accent-line)] bg-[var(--accent-dim)] text-[12.5px] font-medium text-[var(--accent)] transition-colors duration-[var(--fast)]',
                'hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] disabled:cursor-wait disabled:opacity-60',
              )}
            >
              {busy ? 'Working…' : isRegister ? 'Create account' : 'Unlock workspace'}
              {!busy && <ArrowRight size={13} />}
            </button>
          </div>
        </form>

        <p className="mt-3 text-center text-[12px] text-[var(--text-faint)]">
          {isRegister ? (
            <>
              Already set up? <AuthLink href="/login">Sign in</AuthLink>
            </>
          ) : (
            <>
              First time on this instance? <AuthLink href="/register">Create your account</AuthLink>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[var(--accent)] underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

function Field({
  name,
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="label">{label}</span>
      <input
        {...props}
        name={name}
        className="h-[30px] rounded border border-line bg-[var(--surface-base)] px-[9px] text-[12.5px] text-[var(--text)] outline-none transition-colors duration-[var(--fast)] focus:border-[var(--accent-line)]"
      />
      {hint && <span className="text-[11px] text-[var(--text-faint)]">{hint}</span>}
    </label>
  );
}
