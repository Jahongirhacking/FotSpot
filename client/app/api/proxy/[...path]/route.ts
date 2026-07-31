import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api/client';
import { ACCESS_COOKIE } from '@/lib/session';
import { ACTIVE_ROLE_COOKIE } from '@/lib/roles';

/**
 * Attaches the httpOnly access token to browser-originated API calls.
 *
 * Exists so the token is never readable by page JavaScript. The browser calls
 * `/api/proxy/players/search`; this forwards to `${API_BASE}/players/search` with
 * the Authorization header. A 401 is passed through unchanged so
 * `browserFetch` can trigger exactly one refresh and retry.
 *
 * NOTE (Next 16): route `params` is a Promise and must be awaited.
 */
async function forward(request: Request, path: string[]) {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  // The role the user is acting as (§1.2.1). The backend authorizes against this
  // one role rather than every role the token carries, so an admin browsing as an
  // academy manager is refused admin actions. Forged values only ever narrow —
  // the backend ignores any role the token does not already hold.
  const activeRole = store.get(ACTIVE_ROLE_COOKIE)?.value;

  const url = new URL(request.url);
  const target = `${API_BASE}/${path.join('/')}${url.search}`;

  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      ...(body
        ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }
        : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(activeRole ? { 'x-active-role': activeRole } : {}),
      // Preserve device context for the backend's session tracking (README §1.21).
      ...(request.headers.get('user-agent')
        ? { 'user-agent': request.headers.get('user-agent')! }
        : {}),
    },
    ...(body ? { body } : {}),
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ message: 'Could not reach the server.' }, { status: 502 });
  }

  const text = await upstream.text();
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function POST(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function PATCH(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function PUT(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function DELETE(request: Request, ctx: Context) {
  const { path } = await ctx.params;
  return forward(request, path);
}
