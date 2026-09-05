/**
 * Every browser call goes to /api/* on this origin, which the Next route
 * handler in app/api/[...path]/route.ts proxies to Nest. That keeps the
 * httpOnly auth cookies first-party and means no token is ever readable from
 * JavaScript.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorId?: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await send(path, options);

  // A 15-minute access token expiring mid-session is routine, not an error:
  // rotate once and replay. Only once — a second 401 means the refresh token is
  // gone too, and looping would just hammer the API.
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await send('/auth/refresh', { method: 'POST' });
    if (refreshed.ok) return unwrap(await send(path, options));
    window.location.href = '/login';
  }

  return unwrap(response);
}

function send(path: string, options: ApiOptions): Promise<Response> {
  const { body, headers, ...rest } = options;
  return fetch(`/api${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      payload.message ?? 'Something went wrong. Try again.',
      response.status,
      payload.errorId,
      Array.isArray(payload.details) ? payload.details : undefined,
    );
  }
  return payload as T;
}
