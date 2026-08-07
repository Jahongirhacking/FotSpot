'use client';

import { ApiError, extractMessage, type RequestOptions } from './client';

/**
 * Browser-side API calls.
 *
 * The access token lives in an httpOnly cookie the browser cannot read, so client
 * requests are proxied through `/api/proxy/*` on the Next server, which attaches the
 * token and transparently refreshes it on a 401. This keeps the token out of JS
 * entirely (client/CLAUDE.md §2) at the cost of one extra hop.
 */
export async function browserFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const run = () =>
    fetch(`/api/proxy${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

  let response = await run();

  if (response.status === 401) {
    // Only someone who *had* a session can have had it expire. A guest browsing
    // public pages must never be bounced to login by a background request — that
    // is browsing, not an expired session. Without this guard, simply opening a
    // player profile as a guest redirected to /login, because the follow-state
    // query 401s.
    if (!hasSessionCookie()) {
      throw new ApiError(401, 'Sign in to do that.');
    }

    const refreshed = await fetch('/api/auth/refresh', { method: 'POST' });
    if (refreshed.ok) {
      response = await run();
    } else {
      // Terminal: cookies are cleared by the refresh route. Send the user to login
      // rather than leaving the UI in a half-authenticated state.
      if (typeof window !== 'undefined') {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  /*
   * An empty 200 is `null`, not `undefined`.
   *
   * Nest sends nothing at all for a handler that returns `null` — which is what
   * "no review for this player" looks like on the wire. Reading that as
   * `undefined` made TanStack Query throw *"data is undefined"* from inside the
   * query function, which is a framework complaint about our fetch layer dressed
   * up as an application error. `null` is the honest value for a body that says
   * "the answer is nothing", and queries can hold it.
   *
   * 204 stays `undefined`: it means "no content to speak of", which is what a
   * mutation returns, and nobody reads it.
   */
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    // The same reader the server-side boundary uses, so a message the API wrote
    // reads the same whichever side of the app asked for it.
    throw new ApiError(response.status, extractMessage(response.status, payload), payload);
  }

  return payload as T;
}

/**
 * Whether this browser believes it is signed in.
 *
 * `fs_roles` is the one session cookie that is deliberately not httpOnly (it holds
 * role names, no credential), which makes it the only signal available to page
 * scripts. The access token itself is unreadable here by design.
 */
function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((entry) => entry.startsWith('fs_roles='));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
