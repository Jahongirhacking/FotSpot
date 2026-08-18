import {
  canTransition,
  isPubliclyVisible,
  MODERATION_QUEUE_WHERE,
  OWN_MEDIA_WHERE,
  PUBLIC_MEDIA_WHERE,
  transitionRefusal,
} from './media-visibility.util';

/**
 * The invariant this whole module exists for:
 *
 * > A user-uploaded video is unverified by default and becomes publicly visible
 * > only after an authorized admin explicitly verifies it.
 *
 * Everything below is that sentence, checked. The predicates are pure so they can
 * be tested without a database — which matters, because they are what every media
 * query in the codebase asks its question through, and a wrong constant here is
 * wrong in eleven places at once.
 */

describe('isPubliclyVisible — both columns must agree', () => {
  it('publishes a clip that is both ACTIVE and VERIFIED', () => {
    expect(isPubliclyVisible({ status: 'ACTIVE', moderationStatus: 'VERIFIED' })).toBe(true);
  });

  it.each(['UNVERIFIED', 'BLOCKED'] as const)(
    'hides an ACTIVE clip whose moderation status is %s',
    (moderationStatus) => {
      expect(isPubliclyVisible({ status: 'ACTIVE', moderationStatus })).toBe(false);
    },
  );

  it.each(['PROCESSING', 'FAILED', 'FLAGGED', 'REMOVED'] as const)(
    'hides a VERIFIED clip whose lifecycle status is %s',
    (status) => {
      expect(isPubliclyVisible({ status, moderationStatus: 'VERIFIED' })).toBe(false);
    },
  );

  it('hides a clip that does not exist', () => {
    expect(isPubliclyVisible(null)).toBe(false);
    expect(isPubliclyVisible(undefined)).toBe(false);
  });
});

describe('the where clauses every query is built from', () => {
  it('serves the public exactly ACTIVE + VERIFIED', () => {
    expect(PUBLIC_MEDIA_WHERE).toEqual({ status: 'ACTIVE', moderationStatus: 'VERIFIED' });
  });

  it('offers moderators only the clips nobody has judged', () => {
    expect(MODERATION_QUEUE_WHERE).toEqual({ status: 'ACTIVE', moderationStatus: 'UNVERIFIED' });
  });

  /*
   * The owner's clause names no moderation status at all, and that is the point:
   * a player is shown their own clip whether it is waiting, live or blocked, so
   * "my upload vanished" is never the experience. Adding a moderation filter here
   * would be the regression — hence asserting on the absence.
   */
  it('constrains the owner by lifecycle only, never by moderation status', () => {
    expect(OWN_MEDIA_WHERE).toEqual({ status: { in: ['ACTIVE', 'PROCESSING', 'FAILED'] } });
    expect(OWN_MEDIA_WHERE).not.toHaveProperty('moderationStatus');
  });

  it('never shows the owner a clip they themselves deleted', () => {
    expect(OWN_MEDIA_WHERE.status.in).not.toContain('REMOVED');
  });
});

describe('canTransition — only an unreviewed clip can be decided', () => {
  it('allows the two decisions a moderator can make', () => {
    expect(canTransition('UNVERIFIED', 'VERIFIED')).toBe(true);
    expect(canTransition('UNVERIFIED', 'BLOCKED')).toBe(true);
  });

  /*
   * The concurrent-moderation case from the spec: admin A verifies, admin B is
   * still holding the card and presses Block. B's press has to be refused, not
   * applied — the clip is live by then and may already have been watched.
   */
  it('refuses to block a clip another moderator already verified', () => {
    expect(canTransition('VERIFIED', 'BLOCKED')).toBe(false);
  });

  it('refuses to verify a clip another moderator already blocked', () => {
    expect(canTransition('BLOCKED', 'VERIFIED')).toBe(false);
  });

  it('refuses a no-op re-decision', () => {
    expect(canTransition('VERIFIED', 'VERIFIED')).toBe(false);
    expect(canTransition('BLOCKED', 'BLOCKED')).toBe(false);
  });

  it('never lets anything travel back to UNVERIFIED', () => {
    expect(canTransition('VERIFIED', 'UNVERIFIED')).toBe(false);
    expect(canTransition('BLOCKED', 'UNVERIFIED')).toBe(false);
    expect(canTransition('UNVERIFIED', 'UNVERIFIED')).toBe(false);
  });
});

describe('transitionRefusal — the message names what actually happened', () => {
  it('tells the losing admin which decision beat them', () => {
    expect(transitionRefusal('VERIFIED', 'BLOCKED')).toContain('already been verified');
    expect(transitionRefusal('BLOCKED', 'VERIFIED')).toContain('already been blocked');
  });

  it('reads plainly when the same decision is repeated', () => {
    expect(transitionRefusal('VERIFIED', 'VERIFIED')).toBe('This clip has already been verified.');
  });
});
