import type { NextResponse } from 'next/server';
import { ACTIVE_ROLE_COOKIE } from '@/lib/roles';
import { ACCESS_COOKIE, ONBOARDED_COOKIE, REFRESH_COOKIE, ROLES_COOKIE } from '@/lib/session';
import type { AuthSession } from '@/lib/api/types';

const isProd = process.env.NODE_ENV === 'production';

const SESSION_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
} as const;

/** Long-lived, matching the backend's 30-day refresh TTL (`JWT_REFRESH_TTL`). */
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * The access cookie must not outlive the token inside it.
 *
 * It used to be an hour against a fifteen-minute token (`JWT_ACCESS_TTL`), which
 * left a forty-five minute window where the browser held a cookie that looked
 * exactly like a session and contained a dead credential. Every guard that asked
 * "is there a cookie" said yes; every request made with it came back 401. That is
 * what being away for twenty minutes and returning to an error page was.
 *
 * Matching the two means cookie-presence is once again a truthful signal, which
 * is what the guards were always assuming. `isAccessTokenUsable` covers the rest
 * — clock skew, and a deployment that changes `JWT_ACCESS_TTL` without changing
 * this number.
 *
 * A slightly *shorter* cookie than token would also be safe; a longer one is the
 * only combination that lies.
 */
const ACCESS_MAX_AGE = 15 * 60;
/** Preferences outlive the session on purpose (README §1.2.1). */
const PREFERENCE_MAX_AGE = 365 * 24 * 60 * 60;

export function writeSessionCookies(response: NextResponse, session: AuthSession) {
  response.cookies.set(ACCESS_COOKIE, session.accessToken, {
    ...SESSION_COOKIE,
    maxAge: ACCESS_MAX_AGE,
  });
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, {
    ...SESSION_COOKIE,
    maxAge: REFRESH_MAX_AGE,
  });
  // Readable by the client so the shell can render the role switcher without a
  // round trip. Contains role names only — no credential, nothing sensitive.
  response.cookies.set(ROLES_COOKIE, JSON.stringify(session.roles), {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  });
}

/**
 * Clears credentials but deliberately keeps `fs_active_role`.
 *
 * README §1.2.1 requires the active role to survive a full logout → login cycle,
 * and the value is a role name rather than a credential. `fs_onboarded` is kept for
 * the same reason: the welcome question must be asked once, not once per session.
 */
export function clearSessionCookies(response: NextResponse) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, ROLES_COOKIE]) {
    response.cookies.set(name, '', { ...SESSION_COOKIE, maxAge: 0 });
  }
}

export function writeActiveRole(response: NextResponse, role: string) {
  response.cookies.set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: PREFERENCE_MAX_AGE,
  });
}

export function writeOnboarded(response: NextResponse) {
  response.cookies.set(ONBOARDED_COOKIE, '1', {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: PREFERENCE_MAX_AGE,
  });
}
