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
    // A dead refresh token is terminal: clear it so the user gets a clean login
    // rather than an infinite refresh loop.
    const status = error instanceof ApiError ? error.status : 502;
    const response = NextResponse.json({ message: 'Session expired' }, { status });
    clearSessionCookies(response);
    return response;
  }
}
