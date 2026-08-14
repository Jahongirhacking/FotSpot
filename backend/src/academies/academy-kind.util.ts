import { ForbiddenException } from '@nestjs/common';
import { AcademyKind } from '@prisma/client';

/**
 * The line between an academy and a local team, in one place.
 *
 * ## Why a util and not a branch at each call site
 *
 * The rule is not "local teams have fewer buttons" — it is that one specific
 * pipeline does not exist for them: coaches, the online coach review, trials,
 * pass/fail, and the recommendation settlement that hangs off a trial verdict.
 * Six services touch some part of that pipeline, and six hand-written `if
 * (academy.kind === 'LOCAL_TEAM') throw` lines would be six chances to word the
 * rule slightly differently, or to forget it in the seventh.
 *
 * DI-free on purpose, like `scout-level.util.ts`: it takes the kind that the
 * caller has already read and decides, so it is testable without a database and
 * cannot itself become a place where queries accumulate.
 *
 * ## What it deliberately does not guard
 *
 * Squad membership, invitations, groups, scouts and recommendations *reaching*
 * an academy are shared — a local team recruits the same way and its manager
 * runs the same squad screens. Guarding those would not be caution, it would be
 * removing the feature.
 */

/** Local teams are the ones without the coach/trial pipeline. */
export function isLocalTeam(kind: AcademyKind): boolean {
  return kind === AcademyKind.LOCAL_TEAM;
}

/**
 * Refuses an action that only a real academy has.
 *
 * `Forbidden` rather than `BadRequest`: the request is well formed and the
 * caller is who they say they are — they are the manager of this team — and the
 * answer is that their organisation does not do this. That is what 403 means
 * (see backend/CLAUDE.md §6), and it is what the existing manager checks throw.
 *
 * `action` completes the sentence, so the message names the thing that was
 * refused instead of leaving the manager to guess which of several controls on
 * the screen was the problem.
 */
export function assertNotLocalTeam(kind: AcademyKind, action: string): void {
  if (isLocalTeam(kind)) {
    throw new ForbiddenException(`A local team cannot ${action}`);
  }
}
