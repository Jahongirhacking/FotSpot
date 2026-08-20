import { API_BASE } from '@/lib/api/client';
import type { AuthSession } from '@/lib/api/types';
import { isAccessTokenUsable } from './access-token';

/**
 * Restoring a session before anything decides the user is logged out.
 *
 * ## The bug this exists for
 *
 * The proxy asked one question — is there an `fs_access` cookie — and redirected
 * to `/login` when there was not. `fs_refresh` was never consulted, so a user who
 * came back after half an hour was signed out while holding a refresh token good
 * for thirty days. Worse, it happened *before* any page rendered, so no amount of
 * client-side refreshing could rescue it: the redirect had already been issued.
 *
 * The refresh therefore has to happen here, on the server, before the request is
 * allowed to continue or turned away. That is the whole point of this file.
 *
 * ## Four outcomes, and every guard reads the same one
 *
 * - `authenticated` — the access token is usable; nothing was refreshed.
 * - `refreshed` — it was not, and a new pair was minted. Carries the tokens so
 *   the caller can write them onto both the request and the response.
 * - `unauthenticated` — no refresh token to try. Not an error: a signed-out
 *   visitor is the ordinary case on a public page.
 * - `expired` — there was a refresh token and the backend **refused** it. This is
 *   the only outcome that clears cookies, because it is the only one where the
 *   session is provably over.
 * - `unavailable` — the refresh could not be completed at all: a timeout, a
 *   refused connection, a 502 from a deploying API.
 *
 * ## Why `unavailable` is a state and not a failure
 *
 * These two used to be one. Any error meant `expired`, which meant a user whose
 * session was perfectly valid was signed out because the API restarted — the
 * security system punishing them for an outage they had nothing to do with.
 *
 * A network error says nothing about a token. The backend answers 401 for every
 * genuine auth failure it has — invalid, revoked, expired, replayed, account
 * disabled (see `AuthService.refresh`) — so an answer that is *not* 401 or 403 is
 * an answer about the server, not about the session. The session stays intact and
 * the request continues; the next navigation tries again.
 *
 * Fail closed on authority, fail open on availability.
 */
export type AuthState =
  | { status: 'authenticated' }
  | { status: 'refreshed'; session: AuthSession }
  | { status: 'unauthenticated' }
  | { status: 'expired' }
  | { status: 'unavailable' };

/**
 * Works out where a request stands, refreshing if that is what it takes.
 *
 * Deliberately given the two cookie values rather than reading them itself, so it
 * is a pure decision over its inputs plus one network call — testable without a
 * request object, and usable from the proxy and from a route handler alike.
 */
export async function resolveAuth(
  accessToken: string | undefined,
  refreshToken: string | undefined,
): Promise<AuthState> {
  // Case 1. The overwhelmingly common one, and it must cost nothing: a valid
  // token is not refreshed, so a busy tab does not rotate on every navigation.
  if (isAccessTokenUsable(accessToken)) return { status: 'authenticated' };

  // Cases 4 and 5 — nothing to refresh with. Missing and expired access are the
  // same thing here, which is exactly the distinction the old code got wrong by
  // treating "cookie present" as "session valid".
  if (!refreshToken) return { status: 'unauthenticated' };

  // Cases 2 and 3 — the access token is gone or dead and there is a refresh
  // token, so use it. This is the call that never used to happen.
  const result = await mintSession(refreshToken);

  if (result.outcome === 'session') return { status: 'refreshed', session: result.session };

  // Cases 6 and 7. The backend *refused* the refresh token: replayed, revoked or
  // simply too old. That is the point at which the session is over — and the only
  // point, which is what `unavailable` below exists to keep true.
  if (result.outcome === 'rejected') return { status: 'expired' };

  return { status: 'unavailable' };
}

/**
 * The refreshes currently in flight, keyed by the token being spent.
 *
 * ## Why single-flight is a correctness requirement, not a nicety
 *
 * The backend rotates the refresh token on use and treats a second use of an
 * already-rotated one as a replay — it revokes the whole session, which is the
 * right response to a stolen token. A page that prefetches three links while the
 * access token is dead would otherwise send three refreshes: the first rotates,
 * the other two present a spent token, and the user is signed out by the security
 * feature working exactly as designed.
 *
 * ## Why keyed by the token and not a single shared promise
 *
 * One promise per module would be shared across *every visitor* this server is
 * handling, so two people refreshing at the same moment would both receive
 * whichever session resolved first — one of them logged in as the other. Keying
 * by the refresh token means callers only ever join a flight that is spending the
 * very token they hold.
 *
 * This is per-process. A deployment running several instances can still race
 * across them, which is a smaller window than the one it closes and is the
 * reason `browserFetch` keeps its own single-flight for XHRs rather than relying
 * on this.
 */
const inFlight = new Map<string, Promise<RefreshResult>>();

/**
 * What a refresh attempt actually established.
 *
 * Three outcomes, not two, because "it did not work" conflates a dead token with
 * a dead server and only one of those is about the session.
 */
type RefreshResult =
  | { outcome: 'session'; session: AuthSession }
  /** The backend refused the token: 401 or 403. The session is over. */
  | { outcome: 'rejected' }
  /** Nothing was established — timeout, refused connection, 5xx. */
  | { outcome: 'unavailable' };

/**
 * How long to wait on the refresh before giving up.
 *
 * This runs on every navigation whose access token has expired, so an API that
 * hangs would hang the site rather than one request. Timing out lands on
 * `unavailable`, which keeps the session and lets the page render.
 */
const REFRESH_TIMEOUT_MS = 8000;

/** Exchanges a refresh token for a new pair, or says why it could not. */
function mintSession(refreshToken: string): Promise<RefreshResult> {
  const existing = inFlight.get(refreshToken);
  if (existing) return existing;

  const flight = requestSession(refreshToken).finally(() => {
    // Released so the *next* expiry refreshes again rather than reusing a settled
    // promise — a flight never cleared would make one refresh the only one this
    // process ever performs for that token.
    inFlight.delete(refreshToken);
  });

  inFlight.set(refreshToken, flight);
  return flight;
}

async function requestSession(refreshToken: string): Promise<RefreshResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      // A rotated token must never be served from a cache, and an intermediary
      // caching this response would hand the same new pair to two sessions.
      cache: 'no-store',
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    // DNS, a refused connection, a timeout. None of them is a statement about
    // the token, so none of them ends the session.
    return { outcome: 'unavailable' };
  }

  /*
   * Only the backend saying "no" ends a session.
   *
   * `AuthService.refresh` answers 401 for every genuine failure it has — invalid,
   * revoked, expired, replayed, account disabled. 403 is included because a
   * future guard could answer with it. Everything else — 500, 502, 503, a
   * gateway's HTML error page — is the server having a problem, not the session.
   */
  if (response.status === 401 || response.status === 403) return { outcome: 'rejected' };
  if (!response.ok) return { outcome: 'unavailable' };

  try {
    const session = (await response.json()) as AuthSession;
    // A 200 that does not carry a session is a broken response, not a refusal —
    // treating it as a refusal would sign somebody out over a deploy that served
    // an HTML page from the API's hostname.
    return session?.accessToken && session?.refreshToken
      ? { outcome: 'session', session }
      : { outcome: 'unavailable' };
  } catch {
    return { outcome: 'unavailable' };
  }
}
