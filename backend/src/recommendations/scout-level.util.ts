/**
 * Scout Reputation System - README 1.5.
 * success_rate = accepted_recommendations / total_recommendations * 100
 */

interface LevelTier {
  level: number;
  name: string;
  minRecommendations: number;
  minSuccessRate: number; // percentage, e.g. 10 = 10%
  weight: number;
}

// Ordered highest -> lowest so we can pick the first tier a scout qualifies for.
//
// Weights are geometric, not linear (README 1.5, revised v2.0). Each tier's weight tracks its
// "proven placements" = minRecommendations * minSuccessRate, i.e. the minimum number of players
// a scout must have actually put into an academy to reach it: 0, 1, 4, 15, 40, 125. A linear
// 1..6 scale let six free accounts outrank a scout with 125 real placements.
export const SCOUT_LEVEL_TIERS: LevelTier[] = [
  { level: 6, name: 'Legendary Scout', minRecommendations: 250, minSuccessRate: 50, weight: 125 },
  { level: 5, name: 'Master Scout', minRecommendations: 100, minSuccessRate: 40, weight: 50 },
  { level: 4, name: 'Elite Scout', minRecommendations: 50, minSuccessRate: 30, weight: 20 },
  { level: 3, name: 'Talent Hunter', minRecommendations: 20, minSuccessRate: 20, weight: 8 },
  { level: 2, name: 'Spotter', minRecommendations: 5, minSuccessRate: 10, weight: 3 },
  { level: 1, name: 'Observer', minRecommendations: 0, minSuccessRate: 0, weight: 1 },
];

export function computeSuccessRate(total: number, accepted: number): number {
  if (total <= 0) return 0;
  return (accepted / total) * 100;
}

export function computeScoutLevel(total: number, successRate: number): LevelTier {
  const tier = SCOUT_LEVEL_TIERS.find(
    (t) => total >= t.minRecommendations && successRate >= t.minSuccessRate,
  );
  // SCOUT_LEVEL_TIERS always has a level-1 fallback that matches (0, 0).
  return tier as LevelTier;
}

/**
 * Combined credibility of every recommendation backing one player - README 1.5.1.
 *
 * Summing weights linearly would just move the unfairness up a level: 125 throwaway Observer
 * accounts would still equal one Legendary Scout. Discounting the k-th highest weight by k makes
 * fabricated volume grow like ln(n) (125 Observers ~= 5.7) while corroboration from genuinely
 * credible scouts still counts.
 *
 * Caller's responsibility: pass only weights of scouts that are independent of each other per
 * README 12.2 (distinct household, device, network) - non-independent scouts collapse into one
 * entry before they get here.
 *
 * No caller yet: recommendation ranking is a Phase 1.5 feature (README 13.3).
 */
export function computeRecommendationCredibility(weights: number[]): number {
  return [...weights]
    .sort((a, b) => b - a)
    .reduce((total, weight, index) => total + weight / (index + 1), 0);
}
