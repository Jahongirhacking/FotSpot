import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * Asks the API which screen a phone number gets — password, or a code.
 *
 * Proxied through the Next server like the other auth calls so the caller's IP
 * reaches the backend's rate limiter: this endpoint is the one an attacker would
 * sweep numbers against, and a limiter keyed on this server rather than on them
 * would be no limiter at all.
 *
 * It issues no session and sends no message, so there are no cookies to write.
 */
export async function POST(request: Request) {
  const body = await request.json();

  try {
    const result = await apiFetch<{ next: 'PASSWORD' | 'OTP' }>('/auth/phone/start', {
      method: 'POST',
      body,
      headers: forwardedHeaders(request),
    });
    return NextResponse.json(result);
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
