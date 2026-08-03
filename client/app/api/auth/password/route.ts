import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * The two halves of a password reset: `forgot` sends a code, `reset` spends it.
 *
 * One handler for both because they are one screen's worth of work, and because
 * neither returns a credential — the reset deliberately issues no tokens, so
 * unlike `/api/auth/login` there is nothing here to put in a cookie. The user is
 * sent back to sign in with the password they just chose.
 *
 * Routed through Next rather than called directly so the browser keeps talking to
 * one origin, and so the API base URL stays a server-side secret.
 */
export async function POST(request: Request) {
  const { step, ...body } = await request.json().catch(() => ({ step: null }));

  if (step !== 'forgot' && step !== 'reset') {
    return NextResponse.json({ message: 'Unknown request.' }, { status: 400 });
  }

  try {
    const result = await apiFetch<{ sent?: boolean; reset?: boolean; devCode?: string }>(
      step === 'forgot' ? '/auth/password/forgot' : '/auth/password/reset',
      { method: 'POST', body },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: 'Could not reach the server.' }, { status: 502 });
  }
}
