import { ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Object key layout, and the rules that keep public and private objects apart.
 *
 * ## A storage key is a location, never a permission
 *
 * Everything here exists because of one rule: knowing where an object lives must
 * not let you read it. Keys leak — into browser dev tools, proxy logs, error
 * reports, screenshots, support tickets — and a design where the key is the
 * secret is a design that has already failed by the time anyone notices.
 *
 * So the prefix does not *protect* anything; it *declares* intent, and the bucket
 * is configured to serve only `public/` over the CDN. Two visible tiers:
 *
 * - `public/`  — avatars, and player clips.
 * - `private/` — nothing yet; kept for the age and identity documents of §12.1.
 *
 * ## The prefix is a namespace, not a serving policy
 *
 * It stopped being one when clips moved to presigned URLs. **Avatars** are served
 * from the CDN origin and are genuinely public. **Clips** are served by signature
 * (`StorageService.readUrlOrNull`) — permanently reachable because the signature
 * is re-minted on every read, but never composed from a public hostname, which is
 * why they work with no public bucket access configured at all.
 *
 * The consequence worth knowing: if public read access is switched on for the
 * whole bucket, `public/players/…` becomes directly fetchable and the signing
 * stops being the only way in. That is not harmful — clips are meant to stay
 * reachable until deleted either way — but if signing should be the *only* route,
 * scope public access to `public/avatars/` rather than the bucket.
 *
 * Pure and DI-free (backend/CLAUDE.md §2), so the traversal and ownership rules
 * below are unit-testable without a bucket or a Nest container.
 */

export const PUBLIC_PREFIX = 'public/';
export const PRIVATE_PREFIX = 'private/';

/**
 * Extension only, from the last dot, alphanumerics only.
 *
 * A filename arrives from the browser and must never be able to steer the key:
 * no separators, no `..`, no leading dots. Anything unusable becomes `bin`.
 */
export function safeExtension(filename: string): string {
  const ext = filename.includes('.')
    ? filename.split('.').pop()!.replace(/[^a-z0-9]/gi, '')
    : '';
  return ext.slice(0, 10).toLowerCase() || 'bin';
}

/** Random object name — the key never encodes anything the caller chose. */
function objectName(filename: string): string {
  return `${crypto.randomUUID()}.${safeExtension(filename)}`;
}

/** Directory a user's avatars live in. Public: avatars are meant to be cached. */
export function avatarPrefix(userId: string): string {
  return `${PUBLIC_PREFIX}avatars/${userId}/`;
}

export function avatarKey(userId: string, filename: string): string {
  return `${avatarPrefix(userId)}${objectName(filename)}`;
}

/**
 * Directory a player's clips live in.
 *
 * Public: clips are the point of the profile and are meant to be watched,
 * embedded and cached. Serving them through signed URLs cost a round trip before
 * every play, expired mid-session, and made them uncacheable by the CDN — for
 * content whose whole purpose is to be shown to scouts.
 */
export function playerMediaPrefix(playerId: string): string {
  return `${PUBLIC_PREFIX}players/${playerId}/`;
}

export function playerMediaKey(playerId: string, filename: string): string {
  return `${playerMediaPrefix(playerId)}${objectName(filename)}`;
}

/** Cover frame for a clip, in the same tier as the video it was taken from. */
export function playerPosterKey(playerId: string): string {
  return `${playerMediaPrefix(playerId)}${objectName('poster.jpg')}`;
}

export function isPublicKey(key: string): boolean {
  return key.startsWith(PUBLIC_PREFIX);
}

export function isPrivateKey(key: string): boolean {
  return key.startsWith(PRIVATE_PREFIX);
}

/**
 * Confirms a client-supplied key really is one we issued to *this* caller.
 *
 * The upload flow hands the browser a key and takes it back on confirm, which
 * means the key crosses a trust boundary and comes back attacker-controlled.
 * Without this check a player could confirm against `private/players/<someone
 * else>/…` and attach another child's video to their own profile, or point an
 * avatar at an arbitrary object.
 *
 * Rejects traversal outright rather than normalising it: a key containing `..`
 * has no legitimate producer here, so there is nothing to salvage.
 */
export function assertKeyUnder(key: string, prefix: string): void {
  const malformed =
    typeof key !== 'string' ||
    key.length === 0 ||
    key.length > 512 ||
    key.includes('..') ||
    key.includes('//') ||
    key.startsWith('/');

  if (malformed || !key.startsWith(prefix)) {
    throw new ForbiddenException('That upload location is not yours to write to');
  }
}
