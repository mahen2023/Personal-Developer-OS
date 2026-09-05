import type { Signal } from '@/components/primitives';

/**
 * How enum values from the API are shown, in one place.
 *
 * Every module reads its labels and its colours here, so a status means the
 * same thing and looks the same wherever it appears — the list, the board, the
 * context panel, the palette.
 */

export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const PROJECT_STATUS: Record<string, Signal> = {
  PLANNED: 'info',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'neutral',
  ARCHIVED: 'neutral',
};

export const TASK_STATUS: Record<string, Signal> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  BLOCKED: 'danger',
  DONE: 'success',
  CANCELLED: 'neutral',
};

export const ISSUE_STATUS: Record<string, Signal> = {
  OPEN: 'warning',
  INVESTIGATING: 'info',
  BLOCKED: 'danger',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export const PRIORITY: Record<string, Signal> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export const DEPLOYMENT_STATUS: Record<string, Signal> = {
  IN_PROGRESS: 'info',
  SUCCESS: 'success',
  FAILED: 'danger',
  ROLLED_BACK: 'warning',
};

export const SERVER_STATUS: Record<string, Signal> = {
  ONLINE: 'success',
  OFFLINE: 'danger',
  DEGRADED: 'warning',
  UNKNOWN: 'neutral',
  DECOMMISSIONED: 'neutral',
};

/** ADR numbers are permanent citations, so they are always shown padded. */
export function adrNumber(number: number): string {
  return `ADR-${String(number).padStart(3, '0')}`;
}

export const ADR_STATUS: Record<string, Signal> = {
  PROPOSED: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  SUPERSEDED: 'warning',
  DEPRECATED: 'neutral',
};

export const IDEA_STATUS: Record<string, Signal> = {
  IDEA: 'neutral',
  RESEARCHING: 'info',
  PLANNED: 'info',
  BUILDING: 'warning',
  COMPLETED: 'success',
  DISCARDED: 'neutral',
};

export const LEARNING_STATUS: Record<string, Signal> = {
  WANT_TO_LEARN: 'neutral',
  LEARNING: 'info',
  COMPLETED: 'success',
  PAUSED: 'warning',
};

export const DANGER_LEVEL: Record<string, Signal> = {
  SAFE: 'success',
  CAUTION: 'warning',
  HIGH: 'danger',
  DESTRUCTIVE: 'danger',
};

/** How a database backup state reads, and what colour it earns. */
export const BACKUP_SIGNAL: Record<string, { signal: Signal; label: string }> = {
  ok: { signal: 'success', label: 'Backed up' },
  stale: { signal: 'warning', label: 'Backup overdue' },
  never: { signal: 'danger', label: 'Never backed up' },
  none: { signal: 'neutral', label: 'No schedule' },
};

/** The three-state expiry read-out shared by domains and certificates. */
export const EXPIRY_SIGNAL: Record<string, Signal> = {
  valid: 'success',
  warning: 'warning',
  critical: 'danger',
  expired: 'danger',
  unknown: 'neutral',
};

export const HEALTH_SIGNAL: Record<string, Signal> = {
  ok: 'success',
  attention: 'warning',
  warning: 'warning',
  critical: 'danger',
  none: 'neutral',
};

/** Builds the `<option>` list for a status/priority filter or form control. */
export function optionsOf(values: Record<string, unknown>, allLabel?: string) {
  return [
    ...(allLabel ? [{ value: '', label: allLabel }] : []),
    ...Object.keys(values).map((value) => ({ value, label: humanise(value) })),
  ];
}

export const NOTE_TYPES = [
  'GENERAL',
  'TECHNICAL',
  'MEETING',
  'IDEA',
  'RESEARCH',
  'TROUBLESHOOTING',
  'DOCUMENTATION',
  'PERSONAL',
] as const;

export const ENVIRONMENT_TYPES = [
  'DEVELOPMENT',
  'STAGING',
  'PRODUCTION',
  'TESTING',
  'LOCAL',
] as const;

export const SERVER_PROVIDERS = [
  'GCP',
  'AWS',
  'AZURE',
  'DIGITALOCEAN',
  'HETZNER',
  'LOCAL',
  'OTHER',
] as const;

export const REPO_PROVIDERS = ['GITHUB', 'GITLAB', 'BITBUCKET', 'AZURE_DEVOPS', 'OTHER'] as const;

export const DATABASE_TYPES = [
  'POSTGRESQL',
  'MONGODB',
  'MYSQL',
  'REDIS',
  'SQLITE',
  'OTHER',
] as const;

export const BOOKMARK_CATEGORIES = [
  'DOCUMENTATION',
  'TUTORIAL',
  'TOOL',
  'REFERENCE',
  'GITHUB',
  'CLOUD',
  'AI',
  'DATABASE',
  'DEVOPS',
  'SECURITY',
  'OTHER',
] as const;

export const COMMAND_PLATFORMS = [
  'ANY',
  'LINUX',
  'MACOS',
  'WINDOWS',
  'DOCKER',
  'KUBERNETES',
] as const;

export const LEARNING_KINDS = [
  'COURSE',
  'ARTICLE',
  'BOOK',
  'VIDEO',
  'DOCUMENTATION',
  'OTHER',
] as const;

export const VAULT_ITEM_TYPES = [
  'PASSWORD',
  'API_KEY',
  'SSH_KEY',
  'TOTP',
  'TOKEN',
  'CREDENTIAL',
  'OTHER',
] as const;

/** Turns a readonly tuple of enum values into select options. */
export function enumOptions(values: readonly string[], allLabel?: string) {
  return [
    ...(allLabel ? [{ value: '', label: allLabel }] : []),
    ...values.map((value) => ({ value, label: humanise(value) })),
  ];
}

/** Common languages offered by the snippet editor; free text is still allowed. */
export const SNIPPET_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'php',
  'sql',
  'bash',
  'powershell',
  'yaml',
  'json',
  'dockerfile',
  'html',
  'css',
  'go',
  'rust',
  'java',
  'csharp',
  'other',
] as const;
