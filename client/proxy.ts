import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection.
 *
 * NOTE (Next 16): this file used to be `middleware.ts` with an exported
 * `middleware` function. Both were renamed — the convention is now `proxy.ts`
 * exporting `proxy`, and the runtime is always Node.js (edge is not supported
 * here). See node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
 *
 * This only checks for the *presence* of a session cookie, which is enough to keep
 * unauthenticated users out of the app shell. It is not an authorization boundary:
 * the backend guards are (README §1.4).
 */

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/welcome',
  '/onboarding',
  '/notifications',
  '/profile',
  '/settings',
  '/recommendations',
  '/my',
];

const AUTH_ROUTES = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get('fs_access')?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const login = new URL('/login', request.url);
    // Preserve intent so the user lands where they were going, not on a generic home.
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Someone already signed in has no use for the login screen.
  if (hasSession && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the auth route handlers (which must run
    // while unauthenticated), and static files.
    '/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
