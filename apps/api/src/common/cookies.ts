import type { CookieOptions, Response } from 'express';
import { parseDuration } from '../auth/auth.service';

export const ACCESS_COOKIE = 'devos_at';
export const REFRESH_COOKIE = 'devos_rt';
/**
 * Readable marker that says "a session probably exists", nothing more. It holds
 * no token and grants no access; it exists so the Next middleware can tell a
 * signed-in visitor from a stranger without seeing the httpOnly cookies, and so
 * a merely-expired access token routes to a refresh instead of to /login.
 */
export const SESSION_HINT_COOKIE = 'devos_session';

interface CookieConfig {
  secure: boolean;
  domain: string;
  accessTtl: string;
  refreshTtl: string;
}

/**
 * Tokens live in httpOnly cookies so no XSS payload can read them. SameSite
 * is the CSRF control: `lax` still blocks cross-site POSTs, and the refresh
 * cookie is `strict` and scoped to /api/auth so it is never sent anywhere else.
 */
function base(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    domain: config.domain === 'localhost' ? undefined : config.domain,
    path: '/',
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  config: CookieConfig,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(config),
    sameSite: 'lax',
    maxAge: parseDuration(config.accessTtl),
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(config),
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: parseDuration(config.refreshTtl),
  });
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...base(config),
    httpOnly: false,
    sameSite: 'lax',
    maxAge: parseDuration(config.refreshTtl),
  });
}

export function clearAuthCookies(res: Response, config: CookieConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, { ...base(config), sameSite: 'strict', path: '/api/auth' });
  res.clearCookie(SESSION_HINT_COOKIE, { ...base(config), httpOnly: false, sameSite: 'lax' });
}
