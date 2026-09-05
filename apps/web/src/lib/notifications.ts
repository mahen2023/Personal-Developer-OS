import {
  Bell,
  CalendarClock,
  Clock,
  Globe,
  KeyRound,
  type LucideIcon,
  Rocket,
  ShieldCheck,
} from 'lucide-react';
import type { Signal } from '@/components/primitives';

export interface NotificationRow {
  id: string;
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  dueAt: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Where each kind of warning sends you, and what it looks like. */
export const KIND: Record<string, { icon: LucideIcon; path: string }> = {
  SSL_EXPIRY: { icon: ShieldCheck, path: '/certificates' },
  DOMAIN_EXPIRY: { icon: Globe, path: '/domains' },
  TASK_DUE: { icon: Clock, path: '/tasks' },
  TASK_OVERDUE: { icon: CalendarClock, path: '/tasks' },
  PROJECT_DEADLINE: { icon: CalendarClock, path: '/projects' },
  SECRET_ROTATION: { icon: KeyRound, path: '/vault' },
  DEPLOYMENT_FAILED: { icon: Rocket, path: '/deployments' },
  BACKUP_REMINDER: { icon: Bell, path: '/settings/automation' },
  SYSTEM: { icon: Bell, path: '/settings' },
};

export const SEVERITY: Record<NotificationRow['severity'], Signal> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

/** Where clicking a notification should land. */
export function hrefFor(row: NotificationRow): string {
  const kind = KIND[row.kind] ?? KIND.SYSTEM;
  return row.entityId ? `${kind.path}/${row.entityId}` : kind.path;
}
