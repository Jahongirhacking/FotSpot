import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/session';

/**
 * Hands the short-lived access token to the Socket.IO client.
 *
 * The token is httpOnly precisely so page scripts can't read it, but Socket.IO must
 * put it in its `auth` payload. This is the narrow, deliberate exception: it returns
 * only the *access* token (minutes-long, and the backend rejects it for refresh),
 * never the refresh token. Same-origin only, so it is not reachable cross-site.
 */
export async function GET() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;

  if (!token) return NextResponse.json({ message: 'No session' }, { status: 401 });

  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
