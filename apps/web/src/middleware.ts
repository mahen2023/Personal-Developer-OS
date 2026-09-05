import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

/**
 * Gate on the readable session marker only. It carries no authority — every
 * request is still authenticated by the API against the httpOnly token — so
 * forging it buys nothing but a redirect to a page that will 401.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.has('devos_session');
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve where they were headed so sign-in can return them there.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
