'use client';

import { ApiError, type RequestOptions } from './client';

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
  const payload = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const message =
      (payload as { message?: string } | undefined)?.message ??
      "That didn't work. Please try again.";
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
