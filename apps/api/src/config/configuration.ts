/**
 * Single source of truth for environment configuration.
 *
 * Everything the app reads from `process.env` is parsed exactly once, here, so
 * no module has to guess at a default or re-parse a string. `validateEnv` runs
 * at boot and fails loudly rather than letting the app start with a placeholder
 * signing key.
 */

const PLACEHOLDERS = new Set(['replace-me', 'replace-me-differently', 'change-me', '']);

function required(name: string): string {
  const value = process.env[name];
  if (!value || PLACEHOLDERS.has(value)) {
    throw new Error(
      `Missing or placeholder value for ${name}. Copy .env.example to .env and fill it in ` +
        `(see README "First run").`,
    );
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

function int(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function configuration() {
  return {
    env: process.env.NODE_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: int('API_PORT', 4000),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',

    database: {
      url: required('DATABASE_URL'),
    },

    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },

    auth: {
      accessSecret: required('JWT_ACCESS_SECRET'),
      refreshSecret: required('JWT_REFRESH_SECRET'),
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
      cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
      cookieSecure: bool('COOKIE_SECURE', false),
      allowRegistration: bool('ALLOW_REGISTRATION', true),
    },

    vault: {
      envelopeKey: required('VAULT_ENVELOPE_KEY'),
      autoLockMinutes: int('VAULT_AUTOLOCK_MINUTES', 15),
      clipboardSeconds: int('VAULT_CLIPBOARD_SECONDS', 20),
    },

    // Optional. With no host, notifications stay in-app and nothing breaks.
    mail: {
      host: process.env.MAIL_HOST ?? '',
      port: int('MAIL_PORT', 587),
      secure: bool('MAIL_SECURE', false),
      user: process.env.MAIL_USER ?? '',
      password: process.env.MAIL_PASSWORD ?? '',
      from: process.env.MAIL_FROM ?? 'Developer OS <developer-os@localhost>',
    },

    jobs: {
      // Only the worker process registers schedules. Two processes sharing
      // AppModule would otherwise both try to own the same cron.
      enabled: bool('WORKER', false),
      timezone: process.env.JOBS_TIMEZONE ?? 'UTC',
      /// Local hour the daily scans run, in `timezone`.
      dailyHour: int('JOBS_DAILY_HOUR', 7),
    },

    backup: {
      path: process.env.BACKUP_PATH ?? './backups',
      keep: int('BACKUP_KEEP', 7),
      /// 0 disables the scheduled backup; the manual one always works.
      everyDays: int('BACKUP_EVERY_DAYS', 1),
    },

    storage: {
      driver: process.env.STORAGE_DRIVER ?? 'local',
      localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
      maxFileMb: int('STORAGE_MAX_FILE_MB', 50),
    },

    ai: {
      // Answer generation. Off by default: retrieval works without it, and an
      // application that phones home before you have configured it is not one
      // you would want holding your infrastructure notes.
      enabled: bool('AI_ENABLED', false),
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.AI_MODEL ?? 'claude-sonnet-5',

      // Search. `local` needs no account and runs offline; `openai` gives
      // genuinely semantic vectors. Switching means a full re-index, since the
      // two do not produce comparable vectors.
      embeddingProvider: process.env.EMBEDDING_PROVIDER ?? 'local',
      embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
      embeddingKey: process.env.OPENAI_API_KEY ?? '',
    },
  };
}

export type AppConfig = ReturnType<typeof configuration>;

/** Called from main.ts before the Nest app is created. */
export function validateEnv(): AppConfig {
  const config = configuration();
  if (config.isProduction && !config.auth.cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production.');
  }
  if (Buffer.from(config.vault.envelopeKey, 'base64url').length !== 32) {
    throw new Error('VAULT_ENVELOPE_KEY must be 32 bytes encoded as base64url.');
  }
  return config;
}
