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

  const path =
    mode === 'otp'
      ? '/auth/otp/verify'
      : mode === 'register'
        ? '/auth/register/email'
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
