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
 * - `expired` — there was a refresh token and the backend refused it. This is the
 *   only outcome that clears cookies, because it is the only one where the
 *   session is provably over.
 */
export type AuthState =
  | { status: 'authenticated' }
  | { status: 'refreshed'; session: AuthSession }
  | { status: 'unauthenticated' }
  | { status: 'expired' };

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
  const session = await mintSession(refreshToken);
  if (session) return { status: 'refreshed', session };

  // Cases 6 and 7. The backend refused the refresh token: replayed, revoked or
  // simply too old. That is the point at which the session is over.
  return { status: 'expired' };
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
const inFlight = new Map<string, Promise<AuthSession | null>>();

/**
 * Exchanges a refresh token for a new pair.
 *
 * Returns null rather than throwing on *any* failure, but the two failures are
 * not the same and the difference matters:
 *
 * - the backend answering 401 means the token is dead, and the session with it;
 * - the backend being unreachable means nothing about the session at all.
 *
 * Both land on null, and the caller treats null as expired — which signs out a
 * user whose session was fine but whose API was down. That is the conservative
 * direction and the one this already had, but it is worth naming rather than
 * leaving as an accident: distinguishing them would mean deciding what a page
 * should render when the API is unreachable, which is a larger question than
 * this file.
 */
function mintSession(refreshToken: string): Promise<AuthSession | null> {
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

async function requestSession(refreshToken: string): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      // A rotated token must never be served from a cache, and an intermediary
      // caching this response would hand the same new pair to two sessions.
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const session = (await response.json()) as AuthSession;
    return session?.accessToken && session?.refreshToken ? session : null;
  } catch {
    return null;
  }
}
