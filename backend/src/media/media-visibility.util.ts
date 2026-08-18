import type { MediaModerationStatus, MediaStatus, Prisma } from '@prisma/client';

/**
 * Who is allowed to see which clip, in one place.
 *
 * ## Why this is a file and not a `where` clause
 *
 * Visibility is now two columns, not one: `status` is the worker's verdict on
 * whether the bytes reached the bucket, `moderationStatus` is a moderator's
 * verdict on whether anyone may watch them. A clip is public only when both say
 * yes, and that conjunction has to hold in the feed, the profile read, the
 * search-adjacent card stars, the like, the view counter, the comment box and
 * the URL signer.
 *
 * A rule written out eleven times is a rule that holds in ten of them, and the
 * one that gets missed is the one that publishes a minute of unreviewed footage
 * of a child. So it is written once, here, and imported. Pure and DI-free like
 * `scout-level.util.ts`, so the transitions below are unit-testable without
 * standing up Nest.
 */

/** The clip exists as far as the platform is concerned. */
export type MediaVisibilityRow = {
  status: MediaStatus;
  moderationStatus: MediaModerationStatus;
};

/**
 * What a signed-out visitor, a scout, a coach, an academy manager and every
 * player other than the owner may see. Nothing else is ever public.
 */
export const PUBLIC_MEDIA_WHERE = {
  status: 'ACTIVE',
  moderationStatus: 'VERIFIED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * The admin moderation queue: clips whose bytes are really there and which
 * nobody has judged yet.
 *
 * `status: ACTIVE` and not "anything not REMOVED", because a PROCESSING clip has
 * not been found in the bucket yet — there is nothing for a moderator to watch,
 * and it would sit in the queue as an unanswerable card. It arrives the moment
 * the worker promotes it.
 */
export const MODERATION_QUEUE_WHERE = {
  status: 'ACTIVE',
  moderationStatus: 'UNVERIFIED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * What the owner sees on their own profile.
 *
 * Every moderation state, including BLOCKED. A player whose clip was taken down
 * is the one person who should be told: the alternative is a video that silently
 * disappears, which is indistinguishable from a bug and is the moment they
 * upload it again. `REMOVED` is excluded because that is the player's own
 * delete — they asked for it to be gone, and its objects are already deleted
 * from the bucket.
 */
export const OWN_MEDIA_WHERE = {
  status: { in: ['ACTIVE', 'PROCESSING', 'FAILED'] },
} as const satisfies Prisma.MediaWhereInput;

/** The same conjunction as `PUBLIC_MEDIA_WHERE`, for a row already in hand. */
export function isPubliclyVisible(media: MediaVisibilityRow | null | undefined): boolean {
  return media?.status === 'ACTIVE' && media.moderationStatus === 'VERIFIED';
}

/**
 * Which moderation moves are legal, from each state.
 *
 * ## Why a table rather than an `if`
 *
 * Two admins can open the same clip in the same queue. One verifies it; the
 * other, still looking at the card they loaded a minute ago, presses Block. The
 * second press must not silently undo the first — the clip is live by then,
 * possibly watched, and the audit trail would read as two decisions when one of
 * them was made against a screen that was already stale.
 *
 * So a transition is validated against the row as it is *now*, and only
 * UNVERIFIED is a legal starting point. Verify and Block are both terminal:
 * un-blocking is deliberately not a move, because "put it back" is a decision
 * that deserves its own deliberate act rather than a second press of the same
 * button in the same queue.
 */
const ALLOWED_TRANSITIONS: Record<MediaModerationStatus, readonly MediaModerationStatus[]> = {
  UNVERIFIED: ['VERIFIED', 'BLOCKED'],
  VERIFIED: [],
  BLOCKED: [],
};

export function canTransition(from: MediaModerationStatus, to: MediaModerationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Why a refused transition was refused, in words an admin can act on.
 *
 * The useful half is what the clip's state actually is — "someone else already
 * verified this" is the answer to the question the admin is about to ask.
 */
export function transitionRefusal(from: MediaModerationStatus, to: MediaModerationStatus): string {
  const done = from === 'VERIFIED' ? 'verified' : 'blocked';
  if (from === to) return `This clip has already been ${done}.`;
  if (from !== 'UNVERIFIED') {
    return `This clip has already been ${done} by another moderator, so it cannot be ${
      to === 'VERIFIED' ? 'verified' : 'blocked'
    } now.`;
  }
  return 'That is not a moderation decision a clip can move to.';
}
