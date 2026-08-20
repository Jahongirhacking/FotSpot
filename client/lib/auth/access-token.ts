/**
 * Reading the expiry off an access token, without verifying it.
 *
 * ## Why decoding an unverified token is the right thing here
 *
 * This decides one thing only: whether to *attempt a refresh* before rendering.
 * It is not an authorization check and must never be used as one — the backend
 * verifies the signature on every request and remains the sole authority on what
 * the token permits.
 *
 * Verifying here would mean shipping the signing secret to the web tier, which is
 * a far worse trade than reading a claim we already treat as untrusted. The worst
 * a forged `exp` can do is make somebody's own session refresh early (harmless)
 * or not refresh when it should — and that lands on the 401 path, which already
 * refreshes and retries.
 *
 * ## Why an expiry check at all, when the cookie has a lifetime
 *
 * Because they were different lifetimes. The cookie was written with an hour's
 * `maxAge` while the token inside it lasts fifteen minutes, so for forty-five
 * minutes the browser held a cookie that looked like a session and contained a
 * dead credential. Every guard that asked "is there a cookie" said yes, every
 * request made with it came back 401, and the user saw an error on a page they
 * were perfectly entitled to. Aligning the two lifetimes fixes the common case;
 * this catches the rest — clock skew, a token minted with a different TTL, a
 * cookie restored from a session backup.
 */

/**
 * Treat a token as expired this many seconds early.
 *
 * A token with four seconds left will be dead by the time the page it is about to
 * render finishes fetching. Refreshing slightly early costs one rotation; not
 * doing it costs the user an error page.
 */
const EXPIRY_SKEW_SECONDS = 30;

/**
 * Whether this token is unusable — absent, malformed, or past its expiry.
 *
 * A token that cannot be parsed counts as expired: something is wrong with it,
 * and the recoverable response is to refresh rather than to send it and hope.
 * A token with no `exp` at all is treated as *valid*, since a token that never
 * expires is a deliberate backend choice and not this file's to override.
 */
export function isAccessTokenUsable(token: string | undefined | null): boolean {
  if (!token) return false;

  const claims = decodeClaims(token);
  if (!claims) return false;
  if (typeof claims.exp !== 'number') return true;

  return claims.exp * 1000 > Date.now() + EXPIRY_SKEW_SECONDS * 1000;
}

/** The payload of a JWT, or null if it is not one. */
function decodeClaims(token: string): { exp?: number } | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    // base64url → base64, then pad. `atob` is available in both the Node and
    // browser runtimes Next uses, unlike `Buffer` in the edge one.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded)) as unknown;

    return decoded && typeof decoded === 'object' ? (decoded as { exp?: number }) : null;
  } catch {
    return null;
  }
}
