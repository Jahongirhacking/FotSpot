/**
 * The public R2 bucket, and the one place a URL into it is built.
 *
 * ## Why a helper rather than the env var at each call site
 *
 * `NEXT_PUBLIC_MEDIA_URL` is inlined at build time, so every place that reads it
 * bakes in whatever it was set to that day. One reader means one thing to change
 * when the bucket moves, and one place where a trailing slash, a missing value
 * or a leading `/` on the key is handled — three ways the same URL comes out
 * subtly different otherwise.
 *
 * ## The API usually answers with a URL already
 *
 * `StorageService.publicUrlOrNull` builds avatars, clips and academy imagery
 * server-side, and those come back as `avatarUrl`, `logoUrl`, `url` — already
 * absolute. Prefer them: the server knows the storage layout and the client
 * should not have to. This helper is for the cases where only a *key* is at hand,
 * and for the static assets that live in the bucket rather than in `public/` —
 * the playing-style crests and the clip tutorials.
 *
 * Returns null rather than a broken address when nothing is configured, so a
 * caller can fall back to initials or a placeholder instead of rendering an
 * `<img>` pointed at `undefined/...`.
 */
const BASE = (process.env.NEXT_PUBLIC_MEDIA_URL ?? '').replace(/\/+$/, '');

/** Whether a public bucket is configured at all. */
export const MEDIA_CONFIGURED = BASE.length > 0;

/**
 * An absolute URL for a bucket object key.
 *
 * Already-absolute input is passed straight through, so a caller holding
 * whichever of the two the API happened to send does not have to know which.
 */
export function mediaUrl(keyOrUrl?: string | null): string | null {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  if (!MEDIA_CONFIGURED) return null;
  return `${BASE}/${keyOrUrl.replace(/^\/+/, '')}`;
}

/**
 * A path under the bucket, for assets shipped there rather than in `public/`.
 *
 * `mediaAsset('images/playing-styles/box_to_box.png')` — the same join, named so
 * the intent reads differently from resolving a user's upload.
 */
export function mediaAsset(path: string): string | null {
  return mediaUrl(path);
}
