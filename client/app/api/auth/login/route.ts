import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';
import { writeSessionCookies } from '@/lib/cookies';
import type { AuthSession } from '@/lib/api/types';

/**
 * Exchanges credentials for a session and stores the tokens in httpOnly cookies.
 *
 * This must run on the Next server: httpOnly cookies cannot be set from the
 * browser, and putting a refresh token anywhere a script can read it is the thing
 * client/CLAUDE.md §2 explicitly rules out.
 */
export async function POST(request: Request) {
  const { mode, ...credentials } = await request.json();

  /*
   * The OAuth modes land here rather than in routes of their own because what
   * happens *after* the API answers is the same in every case: httpOnly cookies,
   * written on this server because the browser cannot write them. Splitting them
   * out would mean four copies of that, and the copy that drifts is the one that
   * stops being httpOnly.
   *
   * Google and Telegram both sign in and register in one call — the API decides
   * which by whether it already knows the account — so there is no separate
   * "register with Google" path to route.
   */
  const path =
    mode === 'otp'
      ? '/auth/otp/verify'
      : mode === 'register'
        ? '/auth/register/email'
        : mode === 'google'
          ? '/auth/oauth/google'
          : mode === 'telegram'
            ? '/auth/oauth/telegram'
            : '/auth/login/email';

  try {
    const session = await apiFetch<AuthSession>(path, {
      method: 'POST',
      body: credentials,
      // Forward the real client context so the backend's device tracking (README
      // §1.21) records the browser, not this Next server.
      headers: forwardedHeaders(request),
    });

    const response = NextResponse.json({
      roles: session.roles,
      permissions: session.permissions,
    });
    writeSessionCookies(response, session);
    return response;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: 'Could not reach the server.' }, { status: 502 });
  }
}

function forwardedHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const userAgent = request.headers.get('user-agent');
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (userAgent) headers['user-agent'] = userAgent;
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  return headers;
}
