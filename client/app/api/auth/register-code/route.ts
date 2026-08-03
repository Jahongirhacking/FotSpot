import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * Step 1 of signing up: asks the API to send a code to the address.
 *
 * A Next route handler rather than a direct call, so the browser talks to one
 * origin throughout signup exactly as `/api/auth/login` already does. Nothing
 * here sets a cookie — no account exists yet, and the response carries no
 * credential.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await apiFetch<{ sent: boolean; devCode?: string }>(
      '/auth/register/request-code',
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
