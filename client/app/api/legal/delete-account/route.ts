import { NextResponse } from 'next/server';
import { apiFetch, ApiError } from '@/lib/api/client';

/**
 * Forwards a deletion request from the public policy page to the API.
 *
 * It goes through the Next server for one reason: the backend counts failures
 * per IP, and a browser calling the API directly would be counted correctly only
 * by accident. Forwarding `x-forwarded-for` keeps the rate limit keyed on the
 * person typing rather than on this server, which would otherwise look like one
 * caller making every attempt in the world.
 *
 * No session is involved — the password in the body is the whole proof.
 */
export async function POST(request: Request) {
  const body = await request.json();

  try {
    const result = await apiFetch<{ received: boolean }>('/requests/delete-account', {
      method: 'POST',
      body,
      headers: forwardedHeaders(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) {
      // Passed through unchanged, including 429: "try again later" is the honest
      // answer to somebody who has been rate limited, and the backend already
      // phrases every failure so it reveals nothing about which accounts exist.
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
