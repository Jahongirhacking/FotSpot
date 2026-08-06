import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * How a player reaches a coach, whoever sent them.
 *
 * ## One process, two ways in
 *
 * A coach's job is the same sentence every time — *look at this player and say
 * yes or no* — whether the player arrived through a scout's recommendation, an
 * application to an open trial, or a manager who found them in search. What
 * differs is only who pressed the button, so that is the parameter:
 *
 * - `auto`   nobody chose a coach. The academy's least-loaded endorsed coach
 *            gets it, because a general trial can take fifty applications in a
 *            night and a manager routing each one by hand is the bottleneck.
 * - `manual` the manager named the coach. A private trial is about one player,
 *            and the manager usually knows whose eye they want on them.
 *
 * ## One live review per player per academy
 *
 * Not one per prompt. Two coaches deciding the same player for the same academy
 * is a contradiction rather than a second opinion, so a scout's pick who then
 * applies to that academy's trial is one review carrying both references — and
 * the academy answers once.
 */
@Injectable()
export class ProcessAService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Start Process A. Returns the review the coach will decide.
   *
   * The decision itself is `RecommendationsService.decideReview`; its APPROVED
   * is this process returning TRUE, and its REJECTED is FALSE. Both are recorded
   * on one row so "what did the coach say about this player" has one answer.
   */
  async start(params: {
    playerId: string;
    academyId: string;
    mode: 'auto' | 'manual';
    /** Required when mode is `manual`; ignored otherwise. */
    coachUserId?: string;
    /** Restricts `auto` to the coaches working one trial, when there are any. */
    coachPool?: string[];
    trialApplicationId?: string;
    recommendationId?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;

    const player = await db.playerProfile.findUnique({
      where: { id: params.playerId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const coachUserId = await this.pickCoach(db, params);
    const coachProfile = await db.coachProfile.findUnique({ where: { userId: coachUserId } });
    if (!coachProfile) throw new BadRequestException('That coach has no coach profile');

    const review = await db.recommendationReview.upsert({
      where: { playerId_academyId: { playerId: params.playerId, academyId: params.academyId } },
      // Re-running Process A on somebody already reviewed reopens the same row:
      // the academy is asking again, not asking a second person.
      update: {
        coachUserId,
        coachProfileId: coachProfile.id,
        status: 'PENDING',
        decidedAt: null,
        ...(params.trialApplicationId ? { trialApplicationId: params.trialApplicationId } : {}),
        ...(params.recommendationId ? { recommendationId: params.recommendationId } : {}),
      },
      create: {
        playerId: params.playerId,
        academyId: params.academyId,
        coachUserId,
        coachProfileId: coachProfile.id,
        trialApplicationId: params.trialApplicationId ?? null,
        recommendationId: params.recommendationId ?? null,
      },
    });

    await this.notifications.notify(coachUserId, 'REVIEW_ASSIGNED', {
      reviewId: review.id,
      playerId: params.playerId,
      playerName: `${player.firstName} ${player.lastName}`,
      academyId: params.academyId,
    });

    return review;
  }

  /**
   * Whose queue it lands in.
   *
   * A coach must be endorsed by the academy either way — endorsement is what an
   * academy's trust in a coach *is* (§1.5.3), and a review decided by somebody
   * outside it would carry weight the academy never granted.
   */
  private async pickCoach(
    db: Prisma.TransactionClient | PrismaService,
    params: {
      academyId: string;
      mode: 'auto' | 'manual';
      coachUserId?: string;
      coachPool?: string[];
    },
  ) {
    const endorsed = await db.academyEndorsement.findMany({
      where: { academyId: params.academyId, role: 'COACH', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (endorsed.length === 0) {
      throw new BadRequestException('Add a coach to the academy before sending players for review');
    }
    const candidates = endorsed.map((row) => row.userId);

    if (params.mode === 'manual') {
      if (!params.coachUserId) throw new BadRequestException('Choose a coach');
      if (!candidates.includes(params.coachUserId)) {
        throw new BadRequestException('That coach does not work for this academy');
      }
      return params.coachUserId;
    }

    // A trial's own coaches first: they are the people who will be on the pitch
    // that morning, so they are the ones who should have read the profile.
    const pool = params.coachPool?.filter((id) => candidates.includes(id));
    return this.leastLoaded(db, pool?.length ? pool : candidates);
  }

  /** The coach carrying the fewest open reviews. */
  private async leastLoaded(db: Prisma.TransactionClient | PrismaService, candidates: string[]) {
    const open = await db.recommendationReview.groupBy({
      by: ['coachUserId'],
      where: { coachUserId: { in: candidates }, status: 'PENDING' },
      _count: { _all: true },
    });
    const load = new Map(open.map((row) => [row.coachUserId, row._count._all]));
    return candidates.reduce((best, candidate) =>
      (load.get(candidate) ?? 0) < (load.get(best) ?? 0) ? candidate : best,
    );
  }
}
