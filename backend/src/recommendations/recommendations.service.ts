import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import { computeScoutLevel, computeSuccessRate } from './scout-level.util';

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

  /** Academy Manager transitions status: PENDING -> REVIEWING -> ACCEPTED/REJECTED (1.8). */
  async updateStatus(
    userId: string,
    recommendationId: string,
    dto: UpdateRecommendationStatusDto,
  ) {
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
    const acceptedRecommendations =
      existing.acceptedRecommendations + (delta.acceptedDelta ?? 0);
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
