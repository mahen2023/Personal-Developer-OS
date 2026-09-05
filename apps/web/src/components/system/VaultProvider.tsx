'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, api } from '@/lib/api';
import {
  type Bytes,
  type KdfParams,
  type SecretPayload,
  type Sealed,
  decrypt,
  deriveMasterKey,
  encrypt,
  fromBase64,
  newDataKey,
  openPayload,
  sealPayload,
  toBase64,
  verifierFor,
} from '@/lib/vault-crypto';

export interface VaultStatus {
  configured: boolean;
  lastUnlockedAt: string | null;
  autoLockMinutes: number;
  clipboardSeconds: number;
  counts: Record<string, number>;
  kdf: (KdfParams & { algorithm: string }) | null;
}

interface VaultContextValue {
  status: VaultStatus | null;
  unlocked: boolean;
  /** Seconds until auto-lock, or null when locked. */
  locksIn: number | null;
  busy: boolean;
  error: ApiError | null;

  refresh: () => Promise<void>;
  setup: (masterPassword: string) => Promise<boolean>;
  unlock: (masterPassword: string) => Promise<boolean>;
  lock: () => void;

  /** Header the API requires on any route that touches ciphertext. */
  authHeader: () => Record<string, string>;
  sealSecret: (payload: SecretPayload) => Promise<Sealed>;
  revealSecret: (id: string) => Promise<SecretPayload>;
  copyWithTimeout: (value: string) => Promise<number>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

/**
 * Holds the vault's keys — in memory, in this component, and nowhere else.
 *
 * Not localStorage, not sessionStorage, not a cookie: anything persisted
 * survives the lock, and a key that survives the lock is not locked. Closing
 * the tab is therefore also a lock, which is the correct behaviour.
 */
export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [locksIn, setLocksIn] = useState<number | null>(null);

  const dataKey = useRef<Bytes | null>(null);
  const unlockToken = useRef<string | null>(null);
  const deadline = useRef<number | null>(null);
  const clipboardTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const next = await api<VaultStatus>('/vault/status').catch(() => null);
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lock = useCallback(() => {
    // Overwrite before dropping: the buffer may outlive the reference until
    // the collector runs, and there is no reason to leave key material in it.
    dataKey.current?.fill(0);
    dataKey.current = null;
    unlockToken.current = null;
    deadline.current = null;
    setLocksIn(null);
    void api('/vault/lock', { method: 'POST' }).catch(() => undefined);
  }, []);

  const running = locksIn !== null;

  /**
   * The countdown is also the auto-lock (§22): one timer drives both, so what
   * the user sees and what actually happens cannot disagree. The remaining
   * time is read from `deadline`, not from the previous tick, so a suspended
   * laptop locks on wake rather than resuming where it left off.
   */
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (deadline.current === null) return;
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setLocksIn(left);
      if (left === 0) lock();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, lock]);

  /** Any deliberate vault action pushes the auto-lock back. */
  const touch = useCallback(() => {
    if (!status || deadline.current === null) return;
    deadline.current = Date.now() + status.autoLockMinutes * 60_000;
  }, [status]);

  const startSession = useCallback((token: string, minutes: number) => {
    unlockToken.current = token;
    deadline.current = Date.now() + minutes * 60_000;
    setLocksIn(minutes * 60);
  }, []);

  const setup = useCallback(
    async (masterPassword: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const kdf = await api<KdfParams>('/vault/kdf-params');
        const masterKey = await deriveMasterKey(masterPassword, kdf);
        const key = newDataKey();
        const wrapped = await encrypt(masterKey, toBase64(key));

        await api<VaultStatus>('/vault/setup', {
          method: 'POST',
          body: {
            ...kdf,
            verifier: await verifierFor(masterKey),
            wrappedDataKey: wrapped.cipher,
            wrapNonce: wrapped.nonce,
          },
        });

        // Setting up leaves the vault open, so the first item can be added
        // without typing the master password twice.
        const session = await api<{ token: string; expiresIn: number }>('/vault/unlock', {
          method: 'POST',
          body: { verifier: await verifierFor(masterKey) },
        });
        dataKey.current = key;
        startSession(session.token, Math.round(session.expiresIn / 60));
        await refresh();
        return true;
      } catch (caught) {
        setError(
          caught instanceof ApiError ? caught : new ApiError('Could not set up the vault.', 0),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, startSession],
  );

  const unlock = useCallback(
    async (masterPassword: string): Promise<boolean> => {
      if (!status?.kdf) return false;
      setBusy(true);
      setError(null);
      try {
        const masterKey = await deriveMasterKey(masterPassword, status.kdf);
        const session = await api<{
          token: string;
          expiresIn: number;
          wrappedDataKey: string;
          wrapNonce: string;
        }>('/vault/unlock', { method: 'POST', body: { verifier: await verifierFor(masterKey) } });

        const unwrapped = await decrypt(masterKey, {
          cipher: session.wrappedDataKey,
          nonce: session.wrapNonce,
        });
        dataKey.current = fromBase64(unwrapped);
        startSession(session.token, Math.round(session.expiresIn / 60));
        await refresh();
        return true;
      } catch (caught) {
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError('That master password is not correct.', 401),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [status, refresh, startSession],
  );

  const authHeader = useCallback((): Record<string, string> => {
    const token = unlockToken.current;
    return token ? { 'x-vault-token': token } : {};
  }, []);

  const sealSecret = useCallback(
    async (payload: SecretPayload): Promise<Sealed> => {
      if (!dataKey.current) throw new Error('The vault is locked.');
      touch();
      return sealPayload(dataKey.current, payload);
    },
    [touch],
  );

  const revealSecret = useCallback(
    async (id: string): Promise<SecretPayload> => {
      if (!dataKey.current) throw new Error('The vault is locked.');
      touch();
      const sealed = await api<Sealed>(`/vault/items/${id}/reveal`, { headers: authHeader() });
      return openPayload(dataKey.current, sealed);
    },
    [authHeader, touch],
  );

  /**
   * Copies, then clears the clipboard after the configured delay (§22).
   * Returns the number of seconds so the caller can count down honestly.
   */
  const copyWithTimeout = useCallback(
    async (value: string): Promise<number> => {
      const seconds = status?.clipboardSeconds ?? 20;
      await navigator.clipboard.writeText(value);
      touch();

      if (clipboardTimer.current) window.clearTimeout(clipboardTimer.current);
      clipboardTimer.current = window.setTimeout(() => {
        // Only clear what we put there — overwriting something the user copied
        // since would be worse than leaving the secret.
        void navigator.clipboard
          .readText()
          .then((current) => (current === value ? navigator.clipboard.writeText('') : undefined))
          .catch(() => undefined);
      }, seconds * 1000);

      return seconds;
    },
    [status, touch],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      unlocked: locksIn !== null,
      locksIn,
      busy,
      error,
      refresh,
      setup,
      unlock,
      lock,
      authHeader,
      sealSecret,
      revealSecret,
      copyWithTimeout,
    }),
    [
      status,
      locksIn,
      busy,
      error,
      refresh,
      setup,
      unlock,
      lock,
      authHeader,
      sealSecret,
      revealSecret,
      copyWithTimeout,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used inside VaultProvider');
  return context;
}
