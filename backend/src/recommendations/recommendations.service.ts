import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EndorsementRole, RecommendationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EndorsementsService } from '../academies/endorsements.service';
import { academyVisibleWeight, contributionOf } from './recommendation-weight.util';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import {
  computeRecommendationCredibility,
  computeScoutLevel,
  computeSuccessRate,
} from './scout-level.util';

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private endorsements: EndorsementsService,
  ) {}

  /**
   * Files a recommendation — README 1.5.3.
   *
   * GLOBAL is open to any scout and addressed to nobody. SPECIFIC must name
   * academies that currently **endorse** this scout; following is explicitly not
   * enough, because following is social and carries no commitment either way.
   *
   * Both raise the player's global weight. SPECIFIC additionally raises the
   * private weight the target academies see, because the scout has staked a
   * relationship that academy already granted them.
   */
  async create(scoutId: string, dto: CreateRecommendationDto) {
    const player = await this.prisma.playerProfile.findUnique({ where: { id: dto.playerId } });
    if (!player) throw new BadRequestException('Player not found');

    const targets = await this.resolveTargets(scoutId, dto);

    // Snapshot the weight now: a recommendation is evidence about a moment, and
    // the decay job needs a stable number (see Recommendation.scoutWeight).
    const stats = await this.prisma.scoutStats.findUnique({ where: { userId: scoutId } });
    const scoutWeight = stats?.weight ?? 1;
    const contribution = contributionOf(dto.type, scoutWeight);

    const recommendation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.recommendation.create({
        data: {
          scoutId,
          playerId: dto.playerId,
          type: dto.type,
          note: dto.note,
          scoutWeight,
          // Kept in step with `targets` for the single-academy case so existing
          // reads that still use it stay correct.
          academyId: targets.length === 1 ? targets[0] : null,
          targets: { create: targets.map((academyId) => ({ academyId })) },
        },
        include: { targets: true },
      });

      await tx.playerRecommendationWeight.upsert({
        where: { playerId: dto.playerId },
        create: {
          playerId: dto.playerId,
          globalWeight: contribution.global,
          recommendationCount: 1,
          lastRecommendedAt: created.createdAt,
        },
        update: {
          globalWeight: { increment: contribution.global },
          recommendationCount: { increment: 1 },
          lastRecommendedAt: created.createdAt,
        },
      });

      for (const academyId of targets) {
        await tx.playerAcademyRecommendationWeight.upsert({
          where: { playerId_academyId: { playerId: dto.playerId, academyId } },
          create: {
            playerId: dto.playerId,
            academyId,
            extraWeight: contribution.perAcademy,
            recommendationCount: 1,
          },
          update: {
            extraWeight: { increment: contribution.perAcademy },
            recommendationCount: { increment: 1 },
          },
        });
      }

      return created;
    });

    // Only SPECIFIC recommendations enter the success-rate denominator. A GLOBAL
    // one can never be accepted or rejected by anybody, so counting it would drag
    // every scout's success rate toward zero for doing something useful (§1.5).
    if (dto.type === RecommendationType.SPECIFIC) {
      await this.bumpScoutStats(scoutId, { totalDelta: targets.length });
    }

    return recommendation;
  }

  /**
   * Validates the type/academy combination and the endorsement gate.
   * Returns the academy ids this recommendation targets (empty for GLOBAL).
   */
  private async resolveTargets(scoutId: string, dto: CreateRecommendationDto): Promise<string[]> {
    if (dto.type === RecommendationType.GLOBAL) {
      if (dto.academyIds?.length) {
        throw new BadRequestException(
          'A global recommendation is not addressed to an academy. Use type SPECIFIC to name one.',
        );
      }
      return [];
    }

    const requested = [...new Set(dto.academyIds ?? [])];
    if (requested.length === 0) {
      throw new BadRequestException('A specific recommendation must name at least one academy');
    }

    const endorsing = await this.endorsements.filterEndorsing(
      requested,
      scoutId,
      EndorsementRole.SCOUT,
    );

    const rejected = requested.filter((id) => !endorsing.includes(id));
    if (rejected.length > 0) {
      throw new ForbiddenException(
        'You can only recommend to academies that have endorsed you. Following an academy is not enough.',
      );
    }

    return endorsing;
  }

  /**
   * Everything this scout has put forward.
   *
   * Returns the player's name and the academies by name, not bare ids. The screen
   * that renders this had been printing `Player 9f96f84d` and `academy 3f934c7b`,
   * which is unreadable — and it assumed every recommendation targets exactly one
   * academy, which stopped being true when GLOBAL recommendations landed (§1.5.3):
   * those carry `academyId: null` and no targets at all.
   */
  async listMine(scoutId: string) {
    const rows = await this.prisma.recommendation.findMany({
      where: { scoutId },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, firstName: true, lastName: true } },
        academy: { select: { id: true, name: true } },
        targets: {
          select: { status: true, academy: { select: { id: true, name: true } } },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt,
      player: row.player,
      /**
       * One list whichever way the recommendation was addressed: `targets` is
       * authoritative, with the legacy single `academyId` column folded in for
       * rows written before targets existed. GLOBAL leaves it empty.
       */
      academies:
        row.targets.length > 0
          ? row.targets.map((target) => ({ ...target.academy, status: target.status }))
          : row.academy
            ? [{ ...row.academy, status: row.status }]
            : [],
    }));
  }

  async listForAcademy(academyId: string) {
    return this.prisma.recommendation.findMany({
      where: { academyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The academy's inbox — README 1.5.3.
   *
   * Ranked by what this academy actually sees: the player's public global weight
   * plus the private extra earned by recommendations addressed to them. Each
   * player's backing is still collapsed with the §1.5.1 harmonic discount, so a
   * hundred throwaway accounts remain worth far less than one proven scout.
   *
   * Note what no longer appears here: the follow-based trust multiplier. Following
   * is social and carries no weight (§1.5.2); the endorsement a scout needed in
   * order to address this academy at all is the trust signal now, and the extra
   * weight is where it shows up.
   */
  async listRankedForAcademy(userId: string, academyId: string) {
    await this.assertAcademyManager(userId, academyId);

    const targets = await this.prisma.recommendationTarget.findMany({
      where: { academyId, status: { in: ['PENDING', 'REVIEWING'] } },
      include: { recommendation: true },
    });
    if (targets.length === 0) return { items: [], total: 0 };

    const playerIds = [...new Set(targets.map((t) => t.recommendation.playerId))];

    const [globals, extras] = await this.prisma.$transaction([
      this.prisma.playerRecommendationWeight.findMany({ where: { playerId: { in: playerIds } } }),
      this.prisma.playerAcademyRecommendationWeight.findMany({
        where: { academyId, playerId: { in: playerIds } },
      }),
    ]);

    const globalOf = new Map(globals.map((w) => [w.playerId, w.globalWeight]));
    const extraOf = new Map(extras.map((w) => [w.playerId, w.extraWeight]));

    const byPlayer = new Map<
      string,
      { weights: number[]; recommendationIds: string[]; specific: number }
    >();

    for (const target of targets) {
      const { playerId, id, scoutWeight, type } = target.recommendation;
      const entry = byPlayer.get(playerId) ?? { weights: [], recommendationIds: [], specific: 0 };
      entry.weights.push(scoutWeight);
      entry.recommendationIds.push(id);
      if (type === RecommendationType.SPECIFIC) entry.specific += 1;
      byPlayer.set(playerId, entry);
    }

    const items = [...byPlayer.entries()]
      .map(([playerId, entry]) => ({
        playerId,
        recommendationIds: entry.recommendationIds,
        recommendationCount: entry.weights.length,
        specificCount: entry.specific,
        /** Harmonic collapse of the backing scouts (§1.5.1). */
        credibility: computeRecommendationCredibility(entry.weights),
        /** Public, decayable (§1.5.3). */
        globalWeight: globalOf.get(playerId) ?? 0,
        /** This academy's private extra. */
        academyExtraWeight: extraOf.get(playerId) ?? 0,
        academyWeight: academyVisibleWeight(
          globalOf.get(playerId) ?? 0,
          extraOf.get(playerId) ?? 0,
        ),
      }))
      .sort((a, b) => b.academyWeight - a.academyWeight || b.credibility - a.credibility);

    return { items, total: items.length };
  }

  /**
   * A player's public recommendation record — the shape the client renders.
   *
   * `globalWeight` is deliberately its own stored number rather than a sum
   * computed here: a scheduled job decays it so that newly recommended young
   * players can reach the top, and a derived sum has nowhere to put that decay.
   */
  async playerRecommendationSummary(playerId: string) {
    const [weight, recommendations] = await Promise.all([
      this.prisma.playerRecommendationWeight.findUnique({ where: { playerId } }),
      this.prisma.recommendation.findMany({
        where: { playerId },
        include: {
          scout: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
          targets: { select: { academyId: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      playerId,
      globalWeight: weight?.globalWeight ?? 0,
      recommendationCount: weight?.recommendationCount ?? 0,
      lastRecommendedAt: weight?.lastRecommendedAt ?? null,
      scouts: recommendations.map((recommendation) => ({
        id: recommendation.scout.id,
        name: [recommendation.scout.firstName, recommendation.scout.lastName]
          .filter(Boolean)
          .join(' '),
        avatarUrl: this.storage.publicUrlOrNull(recommendation.scout.avatarKey),
        recommendation: {
          id: recommendation.id,
          weight: recommendation.scoutWeight,
          type: recommendation.type,
          // Empty for GLOBAL. Which academies were named is not secret — that a
          // scout vouched for a player to a particular academy is the scout's own
          // public act — but the resulting extra weight stays private to it.
          recommendedAcademies: recommendation.targets.map((t) => t.academyId),
          note: recommendation.note,
          date: recommendation.createdAt,
        },
      })),
    };
  }

  /**
   * An academy decides on a recommendation — README 1.8.
   *
   * The verdict is written to that academy's **target row**, not to the
   * recommendation itself: a specific recommendation can name several academies,
   * and two of them are allowed to disagree about the same player. The scout's
   * success rate counts each verdict separately, which is what makes recommending
   * widely a real risk rather than a free bet.
   */
  async updateStatus(userId: string, recommendationId: string, dto: UpdateRecommendationStatusDto) {
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: { targets: true },
    });
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    if (recommendation.type === RecommendationType.GLOBAL) {
      throw new BadRequestException(
        'A global recommendation is not addressed to an academy and cannot be accepted or rejected.',
      );
    }

    const academyId = await this.resolveDecidingAcademy(userId, recommendation.targets, dto);
    const target = recommendation.targets.find((t) => t.academyId === academyId);

    if (!target) throw new ForbiddenException('This recommendation was not sent to your academy');
    if (target.status === 'ACCEPTED' || target.status === 'REJECTED') {
      throw new BadRequestException('Your academy has already decided on this recommendation');
    }

    const updated = await this.prisma.recommendationTarget.update({
      where: { recommendationId_academyId: { recommendationId, academyId } },
      data: { status: dto.status },
    });

    if (dto.status === 'ACCEPTED') {
      await this.bumpScoutStats(recommendation.scoutId, { acceptedDelta: 1 });
      await this.notifications.notify(recommendation.scoutId, 'RECOMMENDATION_ACCEPTED', {
        recommendationId,
        playerId: recommendation.playerId,
        academyId,
      });

      const player = await this.prisma.playerProfile.findUnique({
        where: { id: recommendation.playerId },
      });
      if (player) {
        await this.notifications.notify(player.userId, 'RECOMMENDATION_ACCEPTED', {
          recommendationId,
          academyId,
        });
      }
    }

    if (dto.status === 'REJECTED') {
      await this.notifications.notify(recommendation.scoutId, 'RECOMMENDATION_REJECTED', {
        recommendationId,
        playerId: recommendation.playerId,
        academyId,
      });
    }

    // Mirror onto the recommendation for single-target rows, so existing reads
    // that still look at `status` stay truthful.
    if (recommendation.targets.length === 1) {
      await this.prisma.recommendation.update({
        where: { id: recommendationId },
        data: { status: dto.status },
      });
    }

    return updated;
  }

  /**
   * Which of the caller's academies is deciding.
   *
   * Explicit when they manage several — guessing would eventually write a verdict
   * to the wrong academy's row, and the scout's reputation would move for a
   * decision nobody made.
   */
  private async resolveDecidingAcademy(
    userId: string,
    targets: { academyId: string }[],
    dto: UpdateRecommendationStatusDto,
  ): Promise<string> {
    if (dto.academyId) {
      await this.assertAcademyManager(userId, dto.academyId);
      return dto.academyId;
    }

    const managed = await this.prisma.academyMember.findMany({
      where: { userId, role: 'MANAGER', academyId: { in: targets.map((t) => t.academyId) } },
      select: { academyId: true },
    });

    if (managed.length === 0) {
      throw new ForbiddenException('Only the academy manager can review recommendations');
    }
    if (managed.length > 1) {
      throw new BadRequestException(
        'You manage more than one of the academies this was sent to — name the deciding academy in `academyId`.',
      );
    }

    return managed[0].academyId;
  }

  /** Academies that endorse this scout — the valid SPECIFIC targets. */
  async endorsingAcademies(userId: string) {
    return this.endorsements.listForUser(userId, EndorsementRole.SCOUT);
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
