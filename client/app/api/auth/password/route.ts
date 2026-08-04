import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

const PATHS = {
  forgot: '/auth/password/forgot',
  verify: '/auth/password/verify-code',
  reset: '/auth/password/reset',
} as const;

/**
 * The three steps of a password reset: send a code, check it, spend it.
 *
 * One handler for all of them because they are one screen's worth of work, and
 * because none returns a credential — the reset deliberately issues no tokens, so
 * unlike `/api/auth/login` there is nothing here to put in a cookie. The user is
 * sent back to sign in with the password they just chose.
 *
 * Routed through Next rather than called directly so the browser keeps talking to
 * one origin, and so the API base URL stays a server-side secret.
 */
export async function POST(request: Request) {
  const { step, ...body } = await request.json().catch(() => ({ step: null }));

  const path = PATHS[step as keyof typeof PATHS];
  if (!path) {
    return NextResponse.json({ message: 'Unknown request.' }, { status: 400 });
  }

  try {
    const result = await apiFetch<{
      sent?: boolean;
      valid?: boolean;
      reset?: boolean;
      devCode?: string;
    }>(path, { method: 'POST', body });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: 'Could not reach the server.' }, { status: 502 });
  }
}
