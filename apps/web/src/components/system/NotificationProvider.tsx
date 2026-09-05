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
import { api } from '@/lib/api';
import { type NotificationRow, hrefFor } from '@/lib/notifications';

interface NotificationValue {
  unread: number;
  latest: NotificationRow[];
  refresh: () => Promise<void>;
  /** Whether the browser will show desktop notifications, and how to change it. */
  desktop: 'unsupported' | 'off' | 'blocked' | 'on';
  enableDesktop: () => Promise<void>;
}

const NotificationContext = createContext<NotificationValue | null>(null);

/** Often enough to be useful, rarely enough that the tab costs nothing. */
const POLL_MS = 120_000;

/**
 * Keeps the unread count in the chrome and raises desktop notifications (§37).
 *
 * Polling rather than a websocket, deliberately: the thing being watched
 * changes once a night. A persistent connection per tab, plus the reconnect
 * logic and the server state to hold it, would be real complexity bought for
 * a two-minute improvement in latency on a single-user application.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<NotificationRow[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [wanted, setWanted] = useState(false);

  // Ids already shown on this device, so a poll does not re-announce them.
  const announced = useRef(new Set<string>());
  const primed = useRef(false);

  const refresh = useCallback(async () => {
    const result = await api<{ items: NotificationRow[]; unread: number }>(
      '/notifications?limit=8&unread=true',
    ).catch(() => null);
    if (!result) return;
    setUnread(result.unread);
    setLatest(result.items);
    return result;
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    void api<{ browser: boolean }>('/notifications/preferences')
      .then((preferences) => setWanted(preferences.browser))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    // A tab left open overnight should catch up the moment it is looked at.
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!wanted || permission !== 'granted') return;

    // The first load is not news. Without this, opening the app after a week
    // away fires eight desktop notifications at once.
    if (!primed.current) {
      for (const row of latest) announced.current.add(row.id);
      primed.current = true;
      return;
    }

    for (const row of latest) {
      if (announced.current.has(row.id)) continue;
      announced.current.add(row.id);
      // Title and body only. Nothing that reaches the OS notification centre
      // should be anything a locked screen must not show.
      const shown = new Notification(row.title, { body: row.body ?? '', tag: row.id });
      shown.onclick = () => {
        window.focus();
        window.location.href = hrefFor(row);
      };
    }
  }, [latest, wanted, permission]);

  const enableDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      await api('/notifications/preferences', { method: 'PATCH', body: { browser: true } });
      setWanted(true);
    }
  }, []);

  const desktop: NotificationValue['desktop'] =
    permission === null
      ? 'unsupported'
      : permission === 'denied'
        ? 'blocked'
        : permission === 'granted' && wanted
          ? 'on'
          : 'off';

  const value = useMemo<NotificationValue>(
    () => ({ unread, latest, refresh: async () => void (await refresh()), desktop, enableDesktop }),
    [unread, latest, refresh, desktop, enableDesktop],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
}
