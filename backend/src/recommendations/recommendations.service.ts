import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import {
  computeRecommendationCredibility,
  computeScoutLevel,
  computeSuccessRate,
} from './scout-level.util';
import { computeAcademyWeight, TrustState } from './scout-trust.util';

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Scout selects Player -> Academy -> Recommendation (1.8). */
  async create(scoutId: string, dto: CreateRecommendationDto) {
    const player = await this.prisma.playerProfile.findUnique({ where: { id: dto.playerId } });
    if (!player) throw new BadRequestException('Player not found');

    const academy = await this.prisma.academyProfile.findUnique({ where: { id: dto.academyId } });
    if (!academy) throw new BadRequestException('Academy not found');

    const recommendation = await this.prisma.recommendation.create({
      data: {
        scoutId,
        playerId: dto.playerId,
        academyId: dto.academyId,
        note: dto.note,
      },
    });

    // total_recommendations increments the moment a recommendation is filed;
    // acceptance is reflected later in accepted_recommendations (1.5/1.8).
    await this.bumpScoutStats(scoutId, { totalDelta: 1 });

    return recommendation;
  }

  async listMine(scoutId: string) {
    return this.prisma.recommendation.findMany({
      where: { scoutId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForAcademy(academyId: string) {
    return this.prisma.recommendation.findMany({
      where: { academyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The academy's inbox, ranked by credibility instead of arrival time (1.5.1/1.5.2).
   *
   * Recommendations are grouped per player, each scout's global weight is scaled by
   * that academy's own trust in them, and the group is collapsed with the harmonic
   * discount from 1.5.1 - so a hundred throwaway accounts backing one player are
   * worth far less than one Legendary Scout.
   */
  async listRankedForAcademy(userId: string, academyId: string) {
    await this.assertAcademyManager(userId, academyId);

    const recommendations = await this.prisma.recommendation.findMany({
      where: { academyId, status: { in: ['PENDING', 'REVIEWING'] } },
    });
    if (recommendations.length === 0) return { items: [], total: 0 };

    const scoutIds = [...new Set(recommendations.map((r) => r.scoutId))];

    const [stats, follows, priorAccepted] = await this.prisma.$transaction([
      this.prisma.scoutStats.findMany({ where: { userId: { in: scoutIds } } }),
      this.prisma.academyScoutFollow.findMany({
        where: { academyId, scoutId: { in: scoutIds } },
      }),
      // How many of *this academy's* past acceptances came from each scout - the
      // TRUSTED threshold in scout-trust.util.ts.
      this.prisma.recommendation.findMany({
        where: { academyId, scoutId: { in: scoutIds }, status: 'ACCEPTED' },
        select: { scoutId: true },
      }),
    ]);

    const weightOf = new Map(stats.map((s) => [s.userId, s.weight]));
    const stateOf = new Map(follows.map((f) => [f.scoutId, f.state as TrustState]));
    const acceptedOf = priorAccepted.reduce(
      (acc, { scoutId }) => acc.set(scoutId, (acc.get(scoutId) ?? 0) + 1),
      new Map<string, number>(),
    );

    // Group by player: credibility is a property of "this player, backed by these
    // scouts", not of any single recommendation.
    const byPlayer = new Map<string, { weights: number[]; recommendationIds: string[] }>();
    for (const rec of recommendations) {
      const academyWeight = computeAcademyWeight(
        weightOf.get(rec.scoutId) ?? 1,
        stateOf.get(rec.scoutId) ?? 'NONE',
        acceptedOf.get(rec.scoutId) ?? 0,
      );

      const entry = byPlayer.get(rec.playerId) ?? { weights: [], recommendationIds: [] };
      entry.weights.push(academyWeight);
      entry.recommendationIds.push(rec.id);
      byPlayer.set(rec.playerId, entry);
    }

    const items = [...byPlayer.entries()]
      .map(([playerId, entry]) => ({
        playerId,
        recommendationIds: entry.recommendationIds,
        recommendationCount: entry.weights.length,
        credibility: computeRecommendationCredibility(entry.weights),
      }))
      .sort((a, b) => b.credibility - a.credibility);

    return { items, total: items.length };
  }

  /** Academy Manager transitions status: PENDING -> REVIEWING -> ACCEPTED/REJECTED (1.8). */
  async updateStatus(userId: string, recommendationId: string, dto: UpdateRecommendationStatusDto) {
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
    });
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    await this.assertAcademyManager(userId, recommendation.academyId);

    if (recommendation.status === 'ACCEPTED' || recommendation.status === 'REJECTED') {
      throw new BadRequestException('Recommendation is already finalized');
    }

    const updated = await this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: { status: dto.status },
    });

    if (dto.status === 'ACCEPTED') {
      // Acceptance affects Scout Reputation / Level / Weight (1.8).
      await this.bumpScoutStats(recommendation.scoutId, { acceptedDelta: 1 });
      await this.notifications.notify(recommendation.scoutId, 'RECOMMENDATION_ACCEPTED', {
        recommendationId,
        playerId: recommendation.playerId,
        academyId: recommendation.academyId,
      });
      const player = await this.prisma.playerProfile.findUnique({
        where: { id: recommendation.playerId },
      });
      if (player) {
        await this.notifications.notify(player.userId, 'RECOMMENDATION_ACCEPTED', {
          recommendationId,
          academyId: recommendation.academyId,
        });
      }
    }

    if (dto.status === 'REJECTED') {
      await this.notifications.notify(recommendation.scoutId, 'RECOMMENDATION_REJECTED', {
        recommendationId,
        playerId: recommendation.playerId,
        academyId: recommendation.academyId,
      });
    }

    return updated;
  }

  async getScoutStats(userId: string) {
    const stats = await this.prisma.scoutStats.findUnique({ where: { userId } });
    return (
      stats ?? {
        userId,
        totalRecommendations: 0,
        acceptedRecommendations: 0,
        successRate: 0,
        level: 1,
        weight: 1,
      }
    );
  }

  /** Recomputes success_rate, level and weight per README 1.5 formula/tiers. */
  private async bumpScoutStats(
    userId: string,
    delta: { totalDelta?: number; acceptedDelta?: number },
  ) {
    const existing = await this.prisma.scoutStats.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const totalRecommendations = existing.totalRecommendations + (delta.totalDelta ?? 0);
    const acceptedRecommendations = existing.acceptedRecommendations + (delta.acceptedDelta ?? 0);
    const successRate = computeSuccessRate(totalRecommendations, acceptedRecommendations);
    const tier = computeScoutLevel(totalRecommendations, successRate);

    return this.prisma.scoutStats.update({
      where: { userId },
      data: {
        totalRecommendations,
        acceptedRecommendations,
        successRate,
        level: tier.level,
        weight: tier.weight,
      },
    });
  }

  private async assertAcademyManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can review recommendations');
    }
    return membership;
  }
}
