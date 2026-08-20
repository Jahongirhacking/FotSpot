import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';
import { clearSessionCookies, writeSessionCookies } from '@/lib/cookies';
import { REFRESH_COOKIE } from '@/lib/session';
import type { AuthSession } from '@/lib/api/types';

/**
 * Rotates the session. The backend revokes the whole session if a refresh token is
 * replayed, so this must never be called speculatively in parallel — one call per
 * detected 401.
 */
export async function POST() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: 'No session' }, { status: 401 });
  }

  try {
    const session = await apiFetch<AuthSession>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    });
    const response = NextResponse.json({ roles: session.roles });
    writeSessionCookies(response, session);
    return response;
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;

    /*
     * Only the backend refusing the token ends the session.
     *
     * This used to clear cookies on *any* error, so an API restart signed out
     * every user whose access token happened to expire during it — their
     * credentials were fine and logging them out was not even a remedy.
     * `AuthService.refresh` answers 401 for every genuine failure (invalid,
     * revoked, expired, replayed, disabled); anything else is the server having
     * a problem, and the session outlives it.
     */
    const refused = status === 401 || status === 403;
    const response = NextResponse.json(
      { message: refused ? 'Session expired' : 'Could not reach the server.' },
      { status },
    );
    if (refused) clearSessionCookies(response);
    return response;
  }
}
