import { type NextRequest, NextResponse } from 'next/server';

/**
 * Same-origin proxy to the Nest API.
 *
 * Going through Next rather than calling the API host directly is what lets the
 * auth cookies stay httpOnly and SameSite — the browser never learns the API's
 * origin, and no access token is ever exposed to client JavaScript. It also
 * removes CORS from the picture entirely for the app itself.
 */

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

// Hop-by-hop and host-specific headers must not be relayed. `content-encoding`
// is stripped on the way back because fetch has already decompressed the body.
const STRIPPED = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'content-encoding',
  'set-cookie',
  // Next sets this for every response including this one; relaying the API's
  // copy too leaves two values, and a browser seeing X-Frame-Options twice
  // fails closed.
  'x-frame-options',
]);

async function proxy(request: NextRequest, path: string[]): Promise<Response> {
  const target = new URL(`/api/${path.join('/')}`, API);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED.has(key)) headers.set(key, value);
  });
  headers.set('x-forwarded-for', request.headers.get('x-forwarded-for') ?? '127.0.0.1');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // The API being down is an expected state on a self-hosted box; report it
    // in the same shape as a real API error so the UI renders it normally.
    return NextResponse.json(
      { statusCode: 503, message: 'The API is not reachable. Check that it is running.' },
      { status: 503 },
    );
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED.has(key)) response.headers.append(key, value);
  });
  // fetch() collapses multiple Set-Cookie headers into one comma-joined value;
  // getSetCookie keeps them apart, which matters because signing in issues the
  // access and refresh cookies together.
  for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

type Context = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, context: Context): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;

export const dynamic = 'force-dynamic';
