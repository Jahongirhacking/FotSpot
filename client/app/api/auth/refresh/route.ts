import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { mintSession } from '@/lib/auth/bootstrap';
import { clearSessionCookies, writeSessionCookies } from '@/lib/cookies';
import { REFRESH_COOKIE } from '@/lib/session';

/**
 * Rotates the session for a browser whose access token died mid-page.
 *
 * Goes through `mintSession`, the same single-flight the proxy uses for
 * navigations: a page that navigates and fires a background query at the same
 * expiry used to spend the token twice — once here, once in the proxy — and the
 * backend read the second as a replay and revoked the session. One flight per
 * token per process means one rotation, whoever asked.
 */
export async function POST(request: Request) {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: 'No session' }, { status: 401 });
  }

  const result = await mintSession(refreshToken, {
    userAgent: request.headers.get('user-agent'),
    forwardedFor: request.headers.get('x-forwarded-for'),
  });

  if (result.outcome === 'session') {
    const response = NextResponse.json({ roles: result.session.roles });
    writeSessionCookies(response, result.session);
    return response;
  }

  /*
   * Only the backend refusing the token ends the session.
   *
   * `AuthService.refresh` answers 401 for every genuine failure (invalid,
   * revoked, expired, replayed, disabled); anything else — a timeout, a 502
   * from a deploying API — is the server having a problem, and the session
   * outlives it. Clearing cookies on that used to sign everybody out whose
   * token happened to expire during a restart.
   */
  if (result.outcome === 'rejected') {
    const response = NextResponse.json({ message: 'Session expired' }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  return NextResponse.json({ message: 'Could not reach the server.' }, { status: 503 });
}
