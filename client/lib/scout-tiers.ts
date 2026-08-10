/**
 * Scout reputation tiers — README §1.5.
 *
 * Mirrored from `backend/src/recommendations/scout-level.util.ts`, which is
 * spec-verbatim and frozen (root CLAUDE.md §7). If those tiers ever change, this
 * table changes in the same PR.
 *
 * Its own module rather than a constant inside `ScoutLevelCard`: the scout's own
 * dashboard and somebody else's scout profile both name the level, and two
 * copies of a frozen table are two chances to drift from the one that decides
 * the number.
 */
export const SCOUT_TIERS = [
  { level: 1, name: 'Observer', minRecommendations: 0, minSuccessRate: 0, weight: 1 },
  { level: 2, name: 'Spotter', minRecommendations: 5, minSuccessRate: 10, weight: 3 },
  { level: 3, name: 'Talent Hunter', minRecommendations: 20, minSuccessRate: 20, weight: 8 },
  { level: 4, name: 'Elite Scout', minRecommendations: 50, minSuccessRate: 30, weight: 20 },
  { level: 5, name: 'Master Scout', minRecommendations: 100, minSuccessRate: 40, weight: 50 },
  { level: 6, name: 'Legendary Scout', minRecommendations: 250, minSuccessRate: 50, weight: 125 },
] as const;

export type ScoutTier = (typeof SCOUT_TIERS)[number];

/** The tier for a level, falling back to Observer for anything unrecognised. */
export function scoutTier(level: number): ScoutTier {
  return SCOUT_TIERS.find((tier) => tier.level === level) ?? SCOUT_TIERS[0];
}

/** The tier above, or null at the top. */
export function nextScoutTier(level: number): ScoutTier | null {
  return SCOUT_TIERS.find((tier) => tier.level === level + 1) ?? null;
}
