import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/api/client';
import { clearSessionCookies } from '@/lib/cookies';
import { ACCESS_COOKIE } from '@/lib/session';

export async function POST(request: Request) {
  const { allDevices = false } = await request.json().catch(() => ({}));
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;

  // Revoke server-side first so the refresh token is dead even if cookie clearing
  // is somehow lost. A failure here still clears locally — a user pressing "log
  // out" must always end up logged out of this browser.
  if (accessToken) {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: { allDevices },
      token: accessToken,
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
