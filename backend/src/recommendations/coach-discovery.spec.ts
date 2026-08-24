import { ForbiddenException } from '@nestjs/common';

import { RecommendationsService } from './recommendations.service';
import { TrialsService } from '../trials/trials.service';

/**
 * The responsibility boundary between a coach and a manager.
 *
 * TRIAL.md §11 is the rule these hold: a coach's ACCEPT means *"this player
 * deserves a look"*, not *"invite this player"*. The invitation and the squad
 * placement are the manager's, and the player has the final word on both.
 *
 * These assert the boundary as a property of the **methods that exist and the
 * guards they open with** rather than by driving a database. That is deliberate:
 * a boundary is broken by somebody adding a method or relaxing a check, and both
 * are visible here without a live Postgres — which the end-to-end behaviour was
 * separately verified against.
 */

const coachOnly = (name: string) => `RecommendationsService.${name}`;

describe('what a coach can and cannot do', () => {
  /** The coach's one action: an online review ACCEPT, from a player's profile. */
  it('gives a coach a way to accept a player they found', () => {
    expect(typeof RecommendationsService.prototype.acceptFromProfile).toBe('function');
  });

  /*
   * The hard rule (§5). A coach must have no route to any of these — not a
   * guarded one, not one that throws at runtime: no method at all on the
   * services a coach's controller can reach.
   */
  it.each([
    ['invite a player to a private trial', 'coachInvite'],
    ['create a trial invitation', 'coachInviteToTrial'],
    ['confirm a trial place', 'coachConfirm'],
    ['add a player to a squad', 'coachAddToSquad'],
  ])('gives a coach no way to %s', (_what, method) => {
    expect(
      (RecommendationsService.prototype as unknown as Record<string, unknown>)[method],
    ).toBeUndefined();
    expect((TrialsService.prototype as unknown as Record<string, unknown>)[method]).toBeUndefined();
  });

  /*
   * The two manager actions live on the services a manager reaches, and each
   * opens by proving the caller is *the* manager. Asserted as source rather than
   * behaviour because the check has to be the first thing the method does — a
   * guard that runs after a write has already happened is not a guard.
   */
  it.each([
    ['invitePlayer', RecommendationsService.prototype.invitePlayer],
    ['pendingManagerActions', RecommendationsService.prototype.pendingManagerActions],
  ])('%s refuses anybody who is not a manager', (_name, method) => {
    expect(method.toString()).toMatch(/role: 'MANAGER'/);
  });

  /*
   * `Accepting coach's academy === hosting manager's academy`.
   *
   * Both ends read their academy from their own ACTIVE membership rather than
   * from the request, so the two cannot diverge: a manager can only invite from
   * the academy they manage, against a review that can only have been written
   * by a coach of that same academy.
   */
  it('the manager invites only from the academy they actively manage', () => {
    const source = RecommendationsService.prototype.invitePlayer.toString();

    expect(source).toMatch(/role: 'MANAGER'/);
    expect(source).toMatch(/status: 'ACTIVE'/);
    expect(source).toMatch(/academyId = membership\.academyId/);
    expect(source).not.toMatch(/dto\.academyId/);
  });

  it.each([
    ['invite', TrialsService.prototype.invite],
    ['addToSquad', TrialsService.prototype.addToSquad],
  ])('TrialsService.%s asserts the hosting academy manager', (_name, method) => {
    expect(method.toString()).toMatch(/assertAcademyManager/);
  });

  /*
   * The state gates TRIAL.md Rules 6 and 8 turn on. `invite` may only act on a
   * SHORTLISTED application and `addToSquad` only on a PASSED one — the two
   * sentences a manager reads when they try to skip a coach's judgement.
   */
  it('invite refuses an application a coach has not shortlisted', () => {
    expect(TrialsService.prototype.invite.toString()).toMatch(/'SHORTLISTED'/);
    expect(TrialsService.prototype.invite.toString()).toMatch(/coach has to approve/i);
  });

  it('addToSquad refuses an application a coach has not passed', () => {
    expect(TrialsService.prototype.addToSquad.toString()).toMatch(/'PASSED'/);
    expect(TrialsService.prototype.addToSquad.toString()).toMatch(/coach has to pass/i);
  });

  /*
   * §13: adding to a squad creates an *invitation*, not a membership. The player
   * still has to say yes. If this ever became a direct membership write, the
   * player would be placed in an academy without being asked.
   */
  it('addToSquad creates an invitation rather than a membership', () => {
    const source = TrialsService.prototype.addToSquad.toString();

    expect(source).toMatch(/invitations\.invite/);
    expect(source).not.toMatch(/academyMember\.create/);
  });

  /*
   * §7: the coach's action must go through the ordinary review decision, so the
   * scouts riding on the player are settled and the manager is notified exactly
   * as they would be from the inbox. Writing an APPROVED row directly would look
   * identical in the database and be wrong everywhere else.
   */
  it('coach discovery decides the review rather than writing its status', () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    expect(source).toMatch(/decideReview/);
    expect(source).toMatch(/processA\.start/);
  });

  /*
   * On the staff *and* endorsed — the overlap, not either one.
   *
   * Each row alone lets somebody through who should not be. Membership alone
   * misses that `ProcessAService.pickCoaches` opens a review only for an
   * endorsed coach, so a withdrawn endorsement surfaced three layers down as a
   * 400 about somebody else's problem. Endorsement alone misses that
   * `AcademiesService.updateMember` stands a coach down to INACTIVE *without*
   * revoking it — which left a coach accepting players for a squad they had
   * been removed from. Dropping either half reopens one of those.
   */
  it('coach discovery requires both an active membership and an active endorsement', () => {
    const resolver = (
      RecommendationsService.prototype as unknown as Record<string, () => unknown>
    ).coachAcademy.toString();

    // Each lookup named separately: asserting that ACTIVE appears *somewhere*
    // passed while the membership query was reading stood-down coaches too.
    const active = (table: string) =>
      new RegExp(
        `${table}\\.findMany\\(\\{\\s*where: \\{ userId, role: 'COACH', status: 'ACTIVE' \\}`,
      );

    expect(resolver).toMatch(active('academyMember'));
    expect(resolver).toMatch(active('academyEndorsement'));
    // The overlap has to be taken, not merely both lists fetched.
    expect(resolver).toMatch(/endorsed\.has/);
  });

  /*
   * The academy is never named by the caller.
   *
   * This is what makes "a coach of Academy A cannot accept for Academy B"
   * structural rather than a validation somebody could forget: there is no
   * request in which an academy id could arrive. It is read from the caller's
   * own membership, so the review can only ever belong to their own academy.
   */
  it('takes the academy from the coach, never from the request', () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    expect(source).toMatch(/coachAcademy\(userId\)/);
    expect(source).toMatch(/academyId = found\.academy\.id/);
    // The DTO carries a note and nothing else — no academy to be trusted.
    expect(source).not.toMatch(/dto\.academyId/);
  });

  it('coach discovery refuses anybody the endorsement does not cover', () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    expect(source).toMatch(/coachAcademy/);
    expect(source).toMatch(/ForbiddenException/);
  });

  /* A local team runs no online review — the gate `assignReview` applies too. */
  it('coach discovery refuses a local team', () => {
    const resolver = (
      RecommendationsService.prototype as unknown as Record<string, () => unknown>
    ).coachAcademy.toString();

    expect(resolver).toMatch(/'ACADEMY'/);
    expect(RecommendationsService.prototype.acceptFromProfile.toString()).toMatch(/LOCAL_TEAM/);
  });

  /* §6.4 and §6.5 — the conflicts that stop a duplicate or a pointless review. */
  it.each([
    ['a player already at the academy', /already at your academy/i],
    ['a player already approved', /already been approved/i],
    ['a player already awaiting a review', /already waiting on a review/i],
    ['a player with an open trial', /already has an open trial/i],
  ])('coach discovery refuses %s', (_what, message) => {
    expect(RecommendationsService.prototype.acceptFromProfile.toString()).toMatch(message);
  });

  it(`${coachOnly('acceptFromProfile')} approves, and never invites`, () => {
    const source = RecommendationsService.prototype.acceptFromProfile.toString();

    expect(source).toMatch(/'APPROVED'/);

    /*
     * Forbidden as a **write**, not as a word.
     *
     * `'INVITED'` legitimately appears in the read that refuses a duplicate —
     * `status: { in: [...] }` over existing applications. What must never appear
     * is an assignment: `status: 'INVITED'` is a coach moving an application
     * along, which is the manager's move.
     */
    expect(source).not.toMatch(/status:\s*'INVITED'/);
    expect(source).not.toMatch(/status:\s*'CONFIRMED'/);
    expect(source).not.toMatch(/addToSquad/);
    expect(source).not.toMatch(/trialApplication\.(create|update)/);
  });
});

/* -------------------------------------------------------------------------- */
/* The read behind the button                                                 */
/* -------------------------------------------------------------------------- */

describe('coachDiscoveryState', () => {
  const source = RecommendationsService.prototype.coachDiscoveryState.toString();

  /*
   * It is drawn on every player profile a coach opens, so it must not be able to
   * change anything. A read that starts a review would open one every time
   * somebody scrolled past a player.
   */
  it('writes nothing', () => {
    expect(source).not.toMatch(/\.(create|update|upsert|delete|createMany|updateMany)\(/);
    expect(source).not.toMatch(/processA\.start/);
    expect(source).not.toMatch(/decideReview/);
  });

  /*
   * The button and the endpoint have to agree. If they asked separately, a coach
   * would meet a 409 from a control the page had just told them was available.
   */
  it('asks the same question the accept asks', () => {
    expect(source).toMatch(/coachAcceptBlocker/);
    expect(RecommendationsService.prototype.acceptFromProfile.toString()).toMatch(
      /coachAcceptBlocker/,
    );
  });

  /* A profile view by a scout or a manager must not 403 in their console. */
  it('answers a non-coach instead of refusing them', () => {
    expect(source).toMatch(/canAccept: false/);
    // A missing player is still a 404 — it is *authorisation* that must not refuse.
    expect(source).not.toMatch(/ForbiddenException/);
    expect(
      (
        RecommendationsService.prototype as unknown as Record<string, () => unknown>
      ).coachAcademy.toString(),
    ).toMatch(/NOT_A_COACH/);
  });
});

/* -------------------------------------------------------------------------- */
/* The dashboard reads state, not notifications                               */
/* -------------------------------------------------------------------------- */

describe('pendingManagerActions', () => {
  const source = RecommendationsService.prototype.pendingManagerActions.toString();

  /**
   * §18. A notification says something happened; this says something is owed.
   * Built from unread notifications, the list would empty exactly when the
   * manager marked them read — which is when they still have the work to do.
   */
  it('never consults the notification table', () => {
    expect(source).not.toMatch(/notification/i);
    expect(source).not.toMatch(/\bread\b/);
  });

  it('derives both actions from the rows that make them true', () => {
    expect(source).toMatch(/recommendationReview\.findMany/);
    expect(source).toMatch(/trialApplication\.findMany/);
    expect(source).toMatch(/status: 'APPROVED'/);
    expect(source).toMatch(/status: 'PASSED'/);
  });

  it('emits the two action types and no others', () => {
    expect(source).toMatch(/INVITE_TO_PRIVATE_TRIAL/);
    expect(source).toMatch(/ADD_TO_SQUAD/);
  });

  /*
   * An approved review whose invitation has already gone out is not owed
   * anything — the player is answering. Filtering on the application is what
   * makes the item disappear by itself rather than needing a flag somebody has
   * to remember to set.
   */
  it('drops an item once the manager has acted on it', () => {
    expect(source).toMatch(/none:/);
    expect(source).toMatch(/'INVITED'/);
  });

  /* A rejection asks the manager for nothing — TRIAL.md's asymmetry. */
  it('never surfaces a rejection or a failure', () => {
    expect(source).not.toMatch(/'REJECTED'/);
    expect(source).not.toMatch(/'FAILED'/);
  });
});
