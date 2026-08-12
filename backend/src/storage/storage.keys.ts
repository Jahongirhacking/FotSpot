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
 * - `public/`  — avatars and academy imagery: things an account chose to publish
 *                as its face, served straight from the CDN.
 * - `private/` — player clips, and the age and identity documents of §12.1.
 *                Reachable only through a signature this API mints.
 *
 * ## The prefix declares intent; the bucket enforces it
 *
 * **Avatars** and **academy imagery** are served from the CDN origin and are
 * genuinely public — `buildPublicUrl` composes them from `R2_PUBLIC_BASE_URL`.
 * **Clips** are served by signature (`StorageService.readUrlOrNull`), and
 * `buildPublicUrl` throws rather than compose a public address for one.
 *
 * That refusal is the code's half of the bargain. The other half is the bucket:
 * public read access must be scoped to `public/`, or `private/…` is fetchable at
 * the CDN host whatever this file intends. A prefix is a declaration, not a
 * permission.
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
 * **Private.** A clip is a video of a child, and the difference between that and
 * an avatar is the difference between a thumbnail somebody chose to publish and
 * a minute of footage taken at a training ground. A permanent public address for
 * the second kind is an address nobody can revoke: once it is in a message, a
 * cache or a scraper's index, deleting the row does not take it back.
 *
 * These were briefly public, for real reasons — signing costs a round trip
 * before playback and makes CDN caching harder. Both are true and both are worth
 * paying: `createReadUrl` signs for the seven-day maximum and re-mints on every
 * read, so a clip stays watchable for as long as it exists, and the signature is
 * stable within an hour so a rewatch still comes from the browser cache.
 *
 * ## This only holds if the bucket agrees
 *
 * The prefix declares intent; the bucket enforces it. If R2 public access is
 * enabled for the whole of `fotspot-media`, `private/players/…` is fetchable at
 * `R2_PUBLIC_BASE_URL` regardless of what this file says. Scope the public
 * development URL (or the custom domain) to `public/` — see backend/README.
 */
export function playerMediaPrefix(playerId: string): string {
  return `${PRIVATE_PREFIX}players/${playerId}/`;
}

export function playerMediaKey(playerId: string, filename: string): string {
  return `${playerMediaPrefix(playerId)}${objectName(filename)}`;
}

/** Cover frame for a clip, in the same tier as the video it was taken from. */
export function playerPosterKey(playerId: string): string {
  return `${playerMediaPrefix(playerId)}${objectName('poster.jpg')}`;
}

/**
 * Directory an academy's own imagery lives in — logo and gallery.
 *
 * Public, like avatars and clips: an academy is an institution advertising
 * itself, not a child. That is the whole difference from `playerMediaPrefix`,
 * and it is why these two never share a directory.
 */
export function academyMediaPrefix(academyId: string): string {
  return `${PUBLIC_PREFIX}academies/${academyId}/`;
}

export function academyMediaKey(academyId: string, filename: string): string {
  return `${academyMediaPrefix(academyId)}${objectName(filename)}`;
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
