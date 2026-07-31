import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RedisService } from '../redis/redis.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N = 10;
/** Long enough that a manager refreshing their home page doesn't re-run six
 *  aggregations; short enough that "this week" still feels live. */
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = 'insights:weekly';

/**
 * "What moved this week" for the people doing the recruiting — README §1.10.
 *
 * ## Why this is not a leaderboard of children
 *
 * §21.4 and §21.5 forbid ranking players against each other and forbid printing a
 * composite rating on a card: a number that ranks a twelve-year-old against their
 * peers is a playground weapon, and the platform refuses to compute one.
 *
 * What this returns is different in kind. It ranks **scout activity**, not
 * ability — "these are the players scouts put forward this week", which is a fact
 * about adults' behaviour, and the exact question an academy opens the platform to
 * ask. It carries no score, no ordering of talent, and no claim that the player at
 * the top is better than the one below.
 *
 * Two guardrails keep it that way, and both matter:
 * - it is never public and never shown to players (see the @Roles list on the
 *   controller), so no child can see where they placed;
 * - the number attached to a player is a count of backing, and it is labelled that
 *   way in the UI — not a rating out of 100.
 */
@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private storage: StorageService,
  ) {}

  async weekly() {
    return this.redis.wrap(CACHE_KEY, CACHE_TTL_SECONDS, async () => {
      const since = new Date(Date.now() - WEEK_MS);
      const [players, scouts, coaches] = await Promise.all([
        this.topPlayers(since),
        this.topScouts(since),
        this.topCoaches(since),
      ]);
      return { since: since.toISOString(), players, scouts, coaches };
    });
  }

  /**
   * Players the most credible scouts put forward this week.
   *
   * Ordered by summed scout weight rather than by headcount, because that is the
   * §1.5 thesis applied to a list: six Observers agreeing is weaker evidence than
   * one Legendary Scout, and a list ordered by raw count would say the opposite.
   */
  private async topPlayers(since: Date) {
    const grouped = await this.prisma.recommendation.groupBy({
      by: ['playerId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { scoutWeight: true },
      orderBy: { _sum: { scoutWeight: 'desc' } },
      take: TOP_N,
    });
    if (grouped.length === 0) return [];

    const profiles = await this.prisma.playerProfile.findMany({
      where: { id: { in: grouped.map((row) => row.playerId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        primaryPosition: true,
        playingStyle: true,
        region: true,
        user: { select: { avatarKey: true } },
      },
    });

    // groupBy returns the ranking; findMany returns them in arbitrary order, so
    // the ranking has to be reapplied rather than assumed.
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return grouped.flatMap((row) => {
      const profile = byId.get(row.playerId);
      if (!profile) return [];
      const { user, ...rest } = profile;
      return [
        {
          ...rest,
          avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey),
          backingCount: row._count._all,
          backingWeight: row._sum.scoutWeight ?? 0,
        },
      ];
    });
  }

  /**
   * Scouts whose picks were **accepted** this week — not scouts who filed the most.
   *
   * Ranking by volume would make the leaderboard a target: filing fifty
   * recommendations is free, and being right is not. Acceptance is the only signal
   * here an academy has to agree with.
   */
  private async topScouts(since: Date) {
    const grouped = await this.prisma.recommendation.groupBy({
      by: ['scoutId'],
      where: { status: 'ACCEPTED', updatedAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { scoutId: 'desc' } },
      take: TOP_N,
    });
    if (grouped.length === 0) return [];

    const ids = grouped.map((row) => row.scoutId);
    const [users, stats] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, avatarKey: true },
      }),
      this.prisma.scoutStats.findMany({ where: { userId: { in: ids } } }),
    ]);

    const byId = new Map(users.map((user) => [user.id, user]));
    const statsById = new Map(stats.map((row) => [row.userId, row]));

    return grouped.flatMap((row) => {
      const user = byId.get(row.scoutId);
      if (!user) return [];
      return [
        {
          ...this.storage.withAvatarUrl(user),
          acceptedThisWeek: row._count._all,
          level: statsById.get(row.scoutId)?.level ?? 1,
          successRate: statsById.get(row.scoutId)?.successRate ?? 0,
        },
      ];
    });
  }

  /** Coaches who assessed the most players this week — the work that turns a
   *  self-reported card into a verified one (§1.6). */
  private async topCoaches(since: Date) {
    const grouped = await this.prisma.coachAssessment.groupBy({
      by: ['coachUserId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { coachUserId: 'desc' } },
      take: TOP_N,
    });
    if (grouped.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((row) => row.coachUserId) } },
      select: { id: true, firstName: true, lastName: true, avatarKey: true },
    });

    const byId = new Map(users.map((user) => [user.id, user]));
    return grouped.flatMap((row) => {
      const user = byId.get(row.coachUserId);
      return user
        ? [{ ...this.storage.withAvatarUrl(user), assessmentsThisWeek: row._count._all }]
        : [];
    });
  }

  /**
   * Counters for the academy manager's home screen.
   *
   * Every count is scoped to this academy — a manager's dashboard should answer
   * "what is waiting for me", not "how big is the platform".
   */
  async academySummary(academyId: string) {
    const since = new Date(Date.now() - WEEK_MS);

    const [pendingRecommendations, newThisWeek, endorsedScouts, endorsedCoaches, openTrials, applications] =
      await Promise.all([
        this.prisma.recommendation.count({
          where: { status: 'PENDING', OR: [{ academyId }, { targets: { some: { academyId } } }] },
        }),
        this.prisma.recommendation.count({
          where: {
            createdAt: { gte: since },
            OR: [{ academyId }, { targets: { some: { academyId } } }],
          },
        }),
        this.prisma.academyEndorsement.count({
          where: { academyId, role: 'SCOUT', status: 'ACTIVE' },
        }),
        this.prisma.academyEndorsement.count({
          where: { academyId, role: 'COACH', status: 'ACTIVE' },
        }),
        this.prisma.trial.count({ where: { academyId, date: { gte: new Date() } } }),
        this.prisma.trialApplication.count({ where: { trial: { academyId } } }),
      ]);

    return {
      pendingRecommendations,
      newThisWeek,
      endorsedScouts,
      endorsedCoaches,
      openTrials,
      applications,
    };
  }
}
