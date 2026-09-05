/** Shared by the auth setup project and the sign-in tests. */
export const STATE_FILE = 'e2e/.auth/state.json';
export const EMAIL = process.env.E2E_EMAIL ?? 'e2e@developer-os.local';
export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-long-enough';

/**
 * Fixed, not per-run: the vault persists between runs, so a master password
 * derived from a run id would lock the suite out of the vault it created.
 */
export const MASTER_PASSWORD = process.env.E2E_MASTER_PASSWORD ?? 'e2e-master-password-fixed';
