import { NextResponse, type NextRequest } from 'next/server';
import { homeHrefForRole } from '@/components/layout/nav';
import type { AuthSession } from '@/lib/api/types';
import { resolveAuth } from '@/lib/auth/bootstrap';
import { clearSessionCookies, writeSessionCookies } from '@/lib/cookies';
import { ACTIVE_ROLE_COOKIE, resolveActiveRole } from '@/lib/roles';
import { ACCESS_COOKIE, REFRESH_COOKIE, ROLES_COOKIE } from '@/lib/session';

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

/** Mirrors `lib/session.ts`'s reader — the cookie holds a JSON array of names. */
function parseRoles(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((role): role is string => typeof role === 'string')
      : [];
  } catch {
    return value.split(',').filter(Boolean);
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /*
   * The auth bootstrap, before any decision is taken about this request.
   *
   * This used to read "is there an `fs_access` cookie" and redirect when there
   * was not. `fs_refresh` was never consulted, so a user returning after half an
   * hour was signed out while holding a refresh token good for thirty days — and
   * because the redirect was issued here, before a single page rendered, nothing
   * on the client could rescue it. That is the bug.
   *
   * `resolveAuth` refreshes when the access token is missing *or* dead, and
   * answers with what the session actually is. Nothing below decides anything
   * until it has.
   */
  /*
   * Route handlers bootstrap themselves.
   *
   * `/api/proxy/*` carries every browser XHR, and those arrive in bursts — a
   * screen opens three queries at once. Refreshing here would mean three
   * concurrent rotations for one expiry, which the backend correctly reads as a
   * replay and answers by revoking the session. `browserFetch` already handles a
   * 401 with its own single-flight refresh and one retry, which is the right
   * place for it: it can retry the call afterwards, and a proxy cannot.
   *
   * Document and RSC navigations are what need bootstrapping, and they are what
   * is left.
   */
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: withPathname(request, pathname) } });
  }

  const auth = await resolveAuth(
    request.cookies.get(ACCESS_COOKIE)?.value,
    request.cookies.get(REFRESH_COOKIE)?.value,
  );

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const hasSession = auth.status === 'authenticated' || auth.status === 'refreshed';

  /*
   * Only a provably dead refresh token clears cookies.
   *
   * `unauthenticated` means there was nothing to try, which is the ordinary state
   * of a visitor who has never signed in — clearing on that would be writing
   * three `Set-Cookie` headers onto every request for a public page.
   */
  if (auth.status === 'expired') {
    const response = isProtected
      ? NextResponse.redirect(loginUrl(request, pathname, search))
      : NextResponse.next({ request: { headers: withPathname(request, pathname) } });
    clearSessionCookies(response);
    return response;
  }

  /*
   * The API could not be reached, which says nothing about the session.
   *
   * The request continues with the cookies untouched: a user whose refresh token
   * is perfectly valid must not be signed out because the API was restarting.
   * Server Components already handle a failed fetch — most catch and render an
   * empty state — so the page degrades instead of the session ending, and the
   * next navigation tries the refresh again.
   *
   * Redirecting here would be the security system punishing somebody for an
   * outage they had nothing to do with, and logging them out is not even a
   * remedy: their credentials were fine.
   */
  if (auth.status === 'unavailable') {
    return NextResponse.next({ request: { headers: withPathname(request, pathname) } });
  }

  if (!hasSession && isProtected) {
    return NextResponse.redirect(loginUrl(request, pathname, search));
  }

  // Someone already signed in has no use for the login screen — send them where
  // their current role begins, not to a fixed `/dashboard` that half the roles do
  // not have in their menu at all.
  if (hasSession && AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    const roles = parseRoles(request.cookies.get(ROLES_COOKIE)?.value);
    const activeRole = resolveActiveRole(roles, request.cookies.get(ACTIVE_ROLE_COOKIE)?.value);
    return NextResponse.redirect(new URL(homeHrefForRole(activeRole), request.url));
  }

  /*
   * A refreshed session has to reach two places, and missing either one is a bug
   * of its own.
   *
   * The **response** carries `Set-Cookie`, so the browser holds the new pair for
   * the next request. The **request** carries it forward into this render, so the
   * Server Components about to run read the new token rather than the dead one
   * they would otherwise still see — without that, the page that triggered the
   * refresh renders unauthenticated anyway and the user has to reload. That is
   * precisely the "second refresh works" symptom.
   */
  const headers = withPathname(request, pathname);
  if (auth.status === 'refreshed') {
    headers.set('cookie', cookieHeaderWith(request, auth.session));
  }

  const response = NextResponse.next({ request: { headers } });
  if (auth.status === 'refreshed') writeSessionCookies(response, auth.session);
  return response;
}

function loginUrl(request: NextRequest, pathname: string, search: string): URL {
  const login = new URL('/login', request.url);
  // Preserve intent so the user lands where they were going, not on a generic home.
  login.searchParams.set('next', `${pathname}${search}`);
  return login;
}

/**
 * The app layout forces an admin-generated password to be replaced before
 * anything else, and needs to know which page it is rendering so it doesn't
 * redirect the password screen to itself. Server Components can read headers but
 * not the current path, so it is passed down as one.
 */
function withPathname(request: NextRequest, pathname: string): Headers {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);
  return headers;
}

/**
 * This request's cookie header with the freshly minted session written into it.
 *
 * Rebuilt by hand rather than relying on `request.cookies.set` propagating into
 * the forwarded headers: the header is what Server Components actually parse, so
 * constructing it explicitly is the version that cannot quietly stop working
 * across a framework upgrade.
 */
function cookieHeaderWith(request: NextRequest, session: AuthSession): string {
  const fresh: Record<string, string> = {
    [ACCESS_COOKIE]: session.accessToken,
    [REFRESH_COOKIE]: session.refreshToken,
    [ROLES_COOKIE]: JSON.stringify(session.roles),
  };

  const kept = request.cookies
    .getAll()
    .filter((cookie) => !(cookie.name in fresh))
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  return [...kept, ...Object.entries(fresh).map(([name, value]) => `${name}=${value}`)].join('; ');
}

export const config = {
  matcher: [
    // Everything except Next internals, the auth route handlers (which must run
    // while unauthenticated), and static files.
    '/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
