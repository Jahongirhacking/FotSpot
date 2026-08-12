/**
 * Recommendation weight maths - README 1.5.3.
 *
 * Two audiences, two numbers:
 *
 *   globalWeight     what everyone sees. Every recommendation adds to it,
 *                    global or specific. Drives discovery and search ranking.
 *   academy extra    what ONE academy additionally sees, from specific
 *                    recommendations addressed to them. Never public.
 *
 * A specific recommendation contributes to BOTH — the scout is saying "this player
 * is good" (global) *and* "…and specifically right for you" (extra). It is not a
 * choice between the two.
 *
 * Pure functions, no DI: the maths is the part worth testing, and it must stay
 * testable without a database (backend/CLAUDE.md §2).
 */

export type RecommendationKind = 'GLOBAL' | 'SPECIFIC';

/**
 * Multiplier applied to a specific recommendation's contribution to the *target
 * academy's* extra weight.
 *
 * 1.0 — the scout's weight counts once globally and once again for that academy,
 * i.e. it is worth double to the academy it was addressed to. Deliberately not
 * higher: §1.5's tier ladder steps by ≥2.5×, so doubling can never let a lesser
 * scout's targeted opinion outrank a better scout's untargeted one. The same
 * ceiling reasoning that capped the old follow-based trust multiplier.
 */
export const SPECIFIC_ACADEMY_MULTIPLIER = 1.0;

export interface WeightContribution {
  /** Added to the player's public global weight. */
  global: number;
  /** Added per target academy, visible only to that academy. */
  perAcademy: number;
}

/**
 * What one recommendation contributes.
 *
 * `scoutWeight` is the snapshot taken when the recommendation was filed, not a
 * live lookup — see `Recommendation.scoutWeight`.
 */
export function contributionOf(kind: RecommendationKind, scoutWeight: number): WeightContribution {
  const weight = Math.max(0, scoutWeight);

  return {
    global: weight,
    perAcademy: kind === 'SPECIFIC' ? weight * SPECIFIC_ACADEMY_MULTIPLIER : 0,
  };
}

/**
 * What an academy actually sees for a player: the public weight plus their own
 * private extra.
 */
export function academyVisibleWeight(globalWeight: number, academyExtra: number): number {
  return globalWeight + academyExtra;
}

/*
 * There is deliberately no time-decay function here any more.
 *
 * `decayedWeight` and its half-life constant lived here waiting for a scheduled
 * job to call them. Reputation is no longer something a clock adjusts: a scout's
 * standing moves when an academy or a coach answers one of their
 * recommendations, and at no other time — see
 * `RecommendationsService.recalculateScoutStats` and README §1.5.
 *
 * Nothing replaced it, because nothing needs to. Every event that can change a
 * scout's record already recalculates it from the target rows, which is a
 * recomputation rather than a delta and therefore idempotent under retries.
 */
