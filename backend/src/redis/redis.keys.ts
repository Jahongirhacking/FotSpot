/**
 * Typed cache-key helpers - README 1.19.
 *
 * Every key used against Redis is built here, never inline in a service. Two reasons:
 * a typo in an inline template string silently creates a second, never-read cache entry,
 * and invalidation needs the exact same string the write used.
 */
export const RedisKeys = {
  playerProfile: (playerId: string) => `player:profile:${playerId}`,
  academyProfile: (academyId: string) => `academy:profile:${academyId}`,
  academyList: (region?: string) => `academy:list:${region ?? 'all'}`,
  /**
   * "This viewer has already been counted for this clip."
   *
   * `identity` is a user id, or `ip:<address>` for a guest — see
   * MediaService.recordView.
   */
  mediaViewClaim: (mediaId: string, identity: string) => `media:view:${mediaId}:${identity}`,
  scoutRanking: () => 'leaderboard:scouts',
  recommendationRanking: (academyId: string) => `leaderboard:recommendations:${academyId}`,
} as const;

/**
 * TTLs in seconds. Cached entities here are read-heavy and slow-changing (1.19); every
 * write path also invalidates explicitly, so the TTL is a safety net against a missed
 * invalidation, not the primary freshness mechanism.
 */
export const CacheTtl = {
  playerProfile: 300,
  academyProfile: 300,
  academyList: 120,
  leaderboard: 60,
} as const;
