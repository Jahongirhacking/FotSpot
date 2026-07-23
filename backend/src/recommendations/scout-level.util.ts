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
export const SCOUT_LEVEL_TIERS: LevelTier[] = [
  { level: 6, name: 'Legendary Scout', minRecommendations: 250, minSuccessRate: 50, weight: 6 },
  { level: 5, name: 'Master Scout', minRecommendations: 100, minSuccessRate: 40, weight: 5 },
  { level: 4, name: 'Elite Scout', minRecommendations: 50, minSuccessRate: 30, weight: 4 },
  { level: 3, name: 'Talent Hunter', minRecommendations: 20, minSuccessRate: 20, weight: 3 },
  { level: 2, name: 'Spotter', minRecommendations: 5, minSuccessRate: 10, weight: 2 },
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
