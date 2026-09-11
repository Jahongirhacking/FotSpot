import type { MediaModerationStatus, MediaStatus, Prisma } from '@prisma/client';

/**
 * Who is allowed to see which clip, in one place.
 *
 * ## Why this is a file and not a `where` clause
 *
 * Two columns describe a clip: `status` is the worker's verdict on whether
 * the bytes reached the bucket, `moderationStatus` is a moderator's verdict
 * on whether anyone may watch them. Only the second decides visibility, and
 * that rule has to hold in the feed, the profile read, the search-adjacent
 * card stars, the like, the view counter, the comment box and the URL signer.
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

/** A row plus the player it belongs to, for the owner-aware checks. */
export type OwnedMediaRow = MediaVisibilityRow & { playerId: string };

/**
 * ## The one rule
 *
 *     visible to users  ⇔  moderationStatus === 'VERIFIED'
 *
 * `status` is the worker's report on the bytes in the bucket — PROCESSING (at
 * it), ACTIVE (done), FAILED (gave up) — and has **no say** in who may watch.
 * A verified clip plays while it is being re-encoded and after a failed
 * attempt alike: the transcoder replaces the object under the *same* key only
 * once it has succeeded, so whatever sits under the key is what plays, and a
 * failed attempt leaves the original exactly where it was. Verifying a clip
 * the worker has not confirmed is gated on the object existing
 * (`ModerationService.decide` asks the bucket), so VERIFIED is always a file
 * that arrived. The moderator's decision and the worker's progress are two
 * facts about one row, and neither waits for the other.
 *
 * Two values of `status` are not processing states at all and are treated as
 * "the clip is gone", never as a visibility rule: REMOVED is a delete (the
 * player's own, or a takedown) whose objects have already left the bucket,
 * and FLAGGED is an admin's takedown pending a decision — which is why
 * `flagMedia` also sets `moderationStatus = BLOCKED`, so the rule above is
 * what hides it. Nothing here ever asks whether a clip is ACTIVE.
 */

/** A row that still exists as a clip — everything but a delete. */
const NOT_REMOVED = { status: { not: 'REMOVED' } } as const satisfies Prisma.MediaWhereInput;

/**
 * What a signed-out visitor, a scout, a coach, an academy manager and every
 * player other than the owner may see: verified, whatever the worker says.
 */
export const PUBLIC_MEDIA_WHERE = {
  ...NOT_REMOVED,
  moderationStatus: 'VERIFIED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * How a player's clips are listed everywhere they are a player's clips: by the
 * day they were filmed, newest first, upload time breaking ties. A clip filmed
 * in May and uploaded in September is a May clip; the profile, every skill
 * tab and the card read time the same way.
 */
export const MEDIA_ORDER = [
  { recordedAt: 'desc' },
  { createdAt: 'desc' },
] as const satisfies Prisma.MediaOrderByWithRelationInput[];

/**
 * The admin moderation queue: clips nobody has judged yet, whether the
 * worker has finished with them, is still at them, or gave up. A clip still
 * PROCESSING, or FAILED, is on the card as the file the player uploaded, so a
 * moderator can review it before the optimised copy exists. One that has not
 * actually arrived cannot be verified; the decision checks the bucket first.
 */
export const MODERATION_QUEUE_WHERE = {
  ...NOT_REMOVED,
  moderationStatus: 'UNVERIFIED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * Clips a moderator took down with the Block button, for the super admin's
 * review list — at any stage of processing, since Block is offered wherever
 * a verified clip is live. A flag (FLAGGED, also BLOCKED) has its own tab and
 * its own two buttons, and a delete has nothing left to review, so neither
 * is listed here. That is a workflow filter on an admin screen, not a rule
 * about what users see.
 */
export const BLOCKED_MEDIA_WHERE = {
  status: { notIn: ['REMOVED', 'FLAGGED'] },
  moderationStatus: 'BLOCKED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * Uploads the worker gave up on, for the super admin's review list.
 *
 * ## Why this list exists
 *
 * `FAILED` is the worker's verdict that a clip could not be confirmed — not
 * there after every retry, empty, oversized, not a video, or unreadable by
 * ffmpeg. It is kept rather than deleted so the *uploader* is told, and so an
 * operator sees a failure that is the platform's own — a missing binary on the
 * host — rather than a child's video vanishing with nobody knowing.
 *
 * ## `status` alone, on purpose
 *
 * No `moderationStatus` clause. This is a processing list, not a moderation
 * list: a verified clip that failed re-encoding is still live and still
 * belongs here so it can be retried. Videos only: an IMAGE through this path
 * is an avatar-adjacent still, not the platform's content, and the retry it
 * offers is a video retry.
 */
export const FAILED_UPLOADS_WHERE = {
  type: 'VIDEO',
  status: 'FAILED',
} as const satisfies Prisma.MediaWhereInput;

/**
 * What the owner sees on their own profile.
 *
 * Every moderation state, including BLOCKED and a flag. A player whose clip
 * was taken down is the one person who should be told: the alternative is a
 * video that silently disappears, which is indistinguishable from a bug and
 * is the moment they upload it again. `REMOVED` is excluded because that is a
 * delete — they asked for it to be gone, and its objects are already deleted
 * from the bucket.
 */
export const OWN_MEDIA_WHERE = NOT_REMOVED;

/** The same rule as `PUBLIC_MEDIA_WHERE`, for a row already in hand. */
export function isPubliclyVisible(media: MediaVisibilityRow | null | undefined): boolean {
  return !!media && media.status !== 'REMOVED' && media.moderationStatus === 'VERIFIED';
}

/**
 * The owner's own clip, at any moderation stage.
 *
 * ## This is not an exception to the public rule, it is a second rule
 *
 * The two are deliberately separate predicates rather than one with an `OR`
 * inside it. `moderationStatus = 'VERIFIED' OR moderationStatus = 'UNVERIFIED'`
 * is the shape this must never take: it reads as an owner allowance and
 * behaves as a public one, publishing every unreviewed clip on the platform
 * to everybody. The owner clause is meaningless unless it is bound to an
 * identity, so identity is a required argument here and there is no way to
 * call it without one.
 *
 * `ownedPlayerId` is the caller's *own* PlayerProfile id, resolved from the
 * authenticated user server-side — never anything the client sent. A caller with
 * no player profile passes `null` and this is simply false for them.
 *
 * Moderation status is not consulted at all, on purpose: an uploader sees their
 * clip while it is processing, while it is queued for review, and after it was
 * blocked. What they see *about* it differs — that is the badge's job — but the
 * clip itself is theirs and never disappears from their own profile.
 */
export function isOwnerVisible(
  media: OwnedMediaRow | null | undefined,
  ownedPlayerId: string | null | undefined,
): boolean {
  if (!media || !ownedPlayerId) return false;
  return media.playerId === ownedPlayerId && media.status !== 'REMOVED';
}

/**
 * May this caller read this clip at all — the single question every media
 * endpoint asks before returning a row, a poster or a signed URL.
 *
 * Public first, then owner. Everything else is a 404, including a moderator: the
 * moderation queue is its own endpoint with its own role gate, and an admin
 * poking a clip id at a player-facing route gets the player-facing answer.
 */
export function canViewMedia(
  media: OwnedMediaRow | null | undefined,
  ownedPlayerId: string | null | undefined,
): boolean {
  return isPubliclyVisible(media) || isOwnerVisible(media, ownedPlayerId);
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
