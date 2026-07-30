import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * Requests an OTP. Kept on the server so the API base URL and error shape are
 * handled in one place, like every other auth call.
 */
export async function POST(request: Request) {
  const body = await request.json();

  try {
    const result = await apiFetch<{ sent: boolean; expiresInSeconds: number; devCode?: string }>(
      '/auth/otp/request',
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
