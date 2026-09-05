'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Wand2 } from 'lucide-react';
import { cx } from '@/lib/format';
import {
  type PasswordOptions,
  entropyBits,
  generatePassphrase,
  generatePassword,
  passphraseEntropyBits,
  strengthOf,
} from '@/lib/vault-crypto';
import { Button } from '@/components/primitives';
import { Toggle } from '@/components/patterns/Form';

/**
 * The generator (§23).
 *
 * Strength is reported in bits of entropy, computed from how the value was
 * actually produced — not from a heuristic that scores "P@ssw0rd!" highly
 * because it has a symbol in it.
 */
export function PasswordGenerator({
  onUse,
  className,
}: {
  onUse: (value: string) => void;
  className?: string;
}) {
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const [options, setOptions] = useState<PasswordOptions>({
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
  });
  const [words, setWords] = useState(4);
  const [value, setValue] = useState('');
  const [copied, setCopied] = useState(false);

  const regenerate = useCallback(() => {
    setValue(mode === 'password' ? generatePassword(options) : generatePassphrase(words));
    setCopied(false);
  }, [mode, options, words]);

  useEffect(regenerate, [regenerate]);

  const bits = mode === 'password' ? entropyBits(options) : passphraseEntropyBits(words);
  const strength = strengthOf(bits);

  return (
    <section
      className={cx(
        'overflow-hidden rounded border border-line bg-[var(--surface-raised)]',
        className,
      )}
    >
      <div className="label flex h-8 items-center gap-2 border-b border-line px-3">
        <Wand2 size={11} className="text-[var(--accent)]" />
        Generate
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 rounded border border-line bg-[var(--surface-base)] px-[9px] py-[7px]">
          <code className="mono min-w-0 flex-1 break-all text-[13px]">{value || '—'}</code>
          <button
            type="button"
            onClick={regenerate}
            title="Generate another"
            className="shrink-0 text-[var(--text-faint)] hover:text-[var(--accent)]"
          >
            <RefreshCw size={12} />
          </button>
          <button
            type="button"
            title="Copy"
            onClick={async () => {
              await navigator.clipboard.writeText(value).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className={cx(
              'shrink-0',
              copied
                ? 'text-[var(--success)]'
                : 'text-[var(--text-faint)] hover:text-[var(--accent)]',
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11.5px]">
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{ background: `var(--${strength.signal})` }}
          />
          <span style={{ color: `var(--${strength.signal})` }}>{strength.label}</span>
          <span className="mono text-[var(--text-faint)]">≈ {bits} bits of entropy</span>
        </div>

        <div className="flex gap-1">
          <ModeTab active={mode === 'password'} onClick={() => setMode('password')}>
            Random
          </ModeTab>
          <ModeTab active={mode === 'passphrase'} onClick={() => setMode('passphrase')}>
            Pronounceable
          </ModeTab>
        </div>

        {mode === 'password' ? (
          <>
            <label className="flex items-center gap-3">
              <span className="label w-[56px] shrink-0">Length</span>
              <input
                type="range"
                min={8}
                max={64}
                value={options.length}
                onChange={(event) => setOptions({ ...options, length: Number(event.target.value) })}
                aria-label="Password length"
                className="h-[3px] flex-1 accent-[var(--accent)]"
              />
              <span className="num w-[24px] shrink-0 text-right text-[11.5px]">
                {options.length}
              </span>
            </label>

            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Toggle
                checked={options.lower}
                onChange={(lower) => setOptions({ ...options, lower })}
                label="a-z"
              />
              <Toggle
                checked={options.upper}
                onChange={(upper) => setOptions({ ...options, upper })}
                label="A-Z"
              />
              <Toggle
                checked={options.digits}
                onChange={(digits) => setOptions({ ...options, digits })}
                label="2-9"
              />
              <Toggle
                checked={options.symbols}
                onChange={(symbols) => setOptions({ ...options, symbols })}
                label="!@#"
              />
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
              Look-alike characters (0/O, 1/l/I) are left out, so a password read off a screen is a
              password you can actually type.
            </p>
          </>
        ) : (
          <>
            <label className="flex items-center gap-3">
              <span className="label w-[56px] shrink-0">Words</span>
              <input
                type="range"
                min={3}
                max={8}
                value={words}
                onChange={(event) => setWords(Number(event.target.value))}
                aria-label="Number of words"
                className="h-[3px] flex-1 accent-[var(--accent)]"
              />
              <span className="num w-[24px] shrink-0 text-right text-[11.5px]">{words}</span>
            </label>
            <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
              Built from syllables rather than a word list — still readable aloud, with no
              dictionary to ship or keep in sync.
            </p>
          </>
        )}

        <Button type="button" variant="primary" onClick={() => onUse(value)} disabled={!value}>
          Use this
        </Button>
      </div>
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'rounded border px-[9px] py-[4px] text-[12px] transition-colors duration-[var(--fast)]',
        active
          ? 'border-[var(--accent-line)] bg-[var(--accent-dim)] text-[var(--accent)]'
          : 'border-line text-[var(--text-muted)] hover:border-[var(--line-strong)]',
      )}
    >
      {children}
    </button>
  );
}
