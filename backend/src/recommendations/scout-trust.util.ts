/**
 * Per-academy scout trust - README 1.5.2.
 *
 * The global weight from `scout-level.util.ts` is objective: the same number for
 * everyone. This layer is subjective - an academy that has repeatedly signed players
 * found by one local coach may weight that coach above the platform average, and an
 * academy drowning in a scout's suggestions may mute them.
 *
 * HARD BOUNDARY: nothing here feeds back into global reputation. success_rate, level
 * and global weight are computed from raw outcomes only. If a follow could raise a
 * scout's global level, scouts would lobby academies for follows, rank higher
 * everywhere, get accepted more, and inflate the very number the platform sells.
 * These functions are pure and read-only for exactly that reason.
 */

/** Mirrors Prisma's `AcademyScoutFollowState`, plus the absence of a row. */
export type TrustState = 'FOLLOWING' | 'MUTED' | 'NONE';

/** Accepted recommendations from this scout, by this academy, to reach TRUSTED. */
export const TRUSTED_ACCEPTED_THRESHOLD = 3;

export const TrustMultiplier = {
  MUTED: 0.25,
  NONE: 1.0,
  FOLLOWED: 1.5,
  TRUSTED: 2.0,
} as const;

/**
 * The 2.0 ceiling is load-bearing, not a round number. Every step of the weight
 * ladder in scout-level.util.ts is a factor of >= 2.5 (1 -> 3 -> 8 -> 20 -> 50 -> 125),
 * so doubling can never lift a scout to the next tier's base weight: a trusted
 * Talent Hunter reaches 16 against an untrusted Elite Scout's 20. An academy can
 * reorder its own inbox by conviction; it cannot manufacture credibility.
 */
export const MAX_TRUST_MULTIPLIER = TrustMultiplier.TRUSTED;

export function computeTrustMultiplier(state: TrustState, acceptedFromScout: number): number {
  if (state === 'MUTED') return TrustMultiplier.MUTED;
  if (state !== 'FOLLOWING') return TrustMultiplier.NONE;

  return acceptedFromScout >= TRUSTED_ACCEPTED_THRESHOLD
    ? TrustMultiplier.TRUSTED
    : TrustMultiplier.FOLLOWED;
}

/**
 * academy_weight(scout, academy) = weight(scout) * trust(scout, academy).
 *
 * Note that MUTED suppresses rather than deletes: a muted Legendary Scout still
 * scores 31.25 - low in the list but present. An academy should not be able to
 * blind itself to the platform's strongest signal, while a muted Observer drops to
 * 0.25 and effectively out of sight, which is where the annoyance actually lives.
 */
export function computeAcademyWeight(
  baseWeight: number,
  state: TrustState,
  acceptedFromScout: number,
): number {
  return baseWeight * computeTrustMultiplier(state, acceptedFromScout);
}
