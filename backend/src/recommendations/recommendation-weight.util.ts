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
  /** Added to the player's public, decayable global weight. */
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

/**
 * Time decay for the scheduled recalculation.
 *
 * WHY THIS EXISTS: without decay, weight is pure accumulation and the top of every
 * search is permanently occupied by whoever has been on the platform longest. A
 * 13-year-old recommended last week would never surface above a 19-year-old
 * recommended fifty times over three years. Decay is what keeps discovery pointed
 * at new talent — which is the entire product (README §1.1).
 *
 * Half-life shaped: weight halves every `halfLifeDays`. Continuous rather than
 * stepped, so a nightly job and a weekly job produce the same curve and re-running
 * it late doesn't over-penalise.
 *
 * Not yet scheduled — no BullMQ workers exist (backend/README). This is the
 * function that job will call, kept here so the maths is settled and tested first.
 */
export const DEFAULT_HALF_LIFE_DAYS = 180;

export function decayedWeight(
  currentWeight: number,
  daysElapsed: number,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): number {
  if (currentWeight <= 0 || daysElapsed <= 0) return Math.max(0, currentWeight);
  if (halfLifeDays <= 0) return currentWeight;

  const decayed = currentWeight * Math.pow(0.5, daysElapsed / halfLifeDays);
  // Two decimals: this is a ranking signal, not an accounting figure, and it keeps
  // stored values from drifting into float noise over many decay passes.
  return Math.round(decayed * 100) / 100;
}
