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
    /** Who sent this player for review — a manager, or the trial they applied to. */
    actor?: { userId: string; role: string };
    tx?: Prisma.TransactionClient;
  }) {
    const db = params.tx ?? this.prisma;

    const player = await db.playerProfile.findUnique({
      where: { id: params.playerId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const coachUserIds = await this.pickCoaches(db, params);
    const profiles = await db.coachProfile.findMany({
      where: { userId: { in: coachUserIds } },
      select: { id: true, userId: true },
    });
    if (profiles.length === 0) throw new BadRequestException('That coach has no coach profile');

    const review = await db.recommendationReview.upsert({
      where: { playerId_academyId: { playerId: params.playerId, academyId: params.academyId } },
      // Re-running Process A on somebody already reviewed reopens the same row:
      // the academy is asking again, not asking a second person. This is also
      // how a trial's real-life assessment follows its profile screening — same
      // question, second time of asking, once the player is on the pitch.
      update: {
        coachUserId: profiles[0].userId,
        coachProfileId: profiles[0].id,
        status: 'PENDING',
        decidedAt: null,
        ...(params.trialApplicationId ? { trialApplicationId: params.trialApplicationId } : {}),
        ...(params.recommendationId ? { recommendationId: params.recommendationId } : {}),
      },
      create: {
        playerId: params.playerId,
        academyId: params.academyId,
        coachUserId: profiles[0].userId,
        coachProfileId: profiles[0].id,
        trialApplicationId: params.trialApplicationId ?? null,
        recommendationId: params.recommendationId ?? null,
      },
    });

    // Replaced rather than added to: reopening a review re-asks the question of
    // whoever is on it now, and a coach who left the trial should not still be
    // holding it in their queue.
    await db.reviewCoach.deleteMany({ where: { reviewId: review.id } });
    await db.reviewCoach.createMany({
      data: profiles.map((profile) => ({
        reviewId: review.id,
        coachUserId: profile.userId,
        coachProfileId: profile.id,
      })),
    });

    for (const profile of profiles) {
      await this.notifications.notify(
        profile.userId,
        'REVIEW_ASSIGNED',
        {
          reviewId: review.id,
          playerId: params.playerId,
          playerName: `${player.firstName} ${player.lastName}`,
          academyId: params.academyId,
        },
        params.actor,
      );
    }

    return review;
  }

  /**
   * Every recommendation a trial will answer, frozen at the moment of asking.
   *
   * A player rarely arrives on one scout's word: one may have filed a GLOBAL
   * recommendation months ago and another a SPECIFIC one to this academy last
   * week. Both said *look at this player*, and the trial answers both — so both
   * gain when the player signs, and both are turned down together when a coach
   * says no.
   *
   * Taken now rather than at the end: a scout who files after the trial was
   * arranged did not help arrange it, and counting them would make the success
   * rate reward timing over judgement.
   *
   * It lives here because it is the seam between recommendations and trials, and
   * both sides create applications — the inbox by inviting, the trial by
   * nominating or being applied to.
   */
  async snapshotBackings(applicationId: string, playerId: string, academyId: string) {
    const backing = await this.prisma.recommendation.findMany({
      where: {
        playerId,
        rejectedAt: null,
        // A cleared recommendation was already settled by a trial the player
        // passed (Rule 13). It is not riding on this one.
        clearedAt: null,
        // Addressed to this academy, or offered to everyone — a GLOBAL
        // recommendation is a scout saying "somebody should look at this
        // player", and this academy is the somebody that did.
        OR: [{ targets: { some: { academyId } } }, { type: 'GLOBAL' }],
      },
      select: { id: true },
    });
    if (backing.length === 0) return;

    await this.prisma.trialApplicationBacking.createMany({
      data: backing.map((recommendation) => ({
        applicationId,
        recommendationId: recommendation.id,
      })),
      skipDuplicates: true,
    });
  }

  /** The recommendations riding on this application, the prompting one included. */
  async backingsOf(applicationId: string, promptId: string | null) {
    const rows = await this.prisma.trialApplicationBacking.findMany({
      where: { applicationId },
      select: { recommendationId: true },
    });
    const ids = new Set(rows.map((row) => row.recommendationId));
    if (promptId) ids.add(promptId);
    return [...ids];
  }

  /**
   * Whose queues it lands in.
   *
   * `manual` names one coach; `auto` hands it to *every* coach working the trial,
   * because a trial is worked by a staff and the profile should be in front of
   * everybody who will be on the pitch. With no trial staff it falls back to the
   * academy's least-loaded coach, which is the only sensible reading of "send
   * this to whoever is free".
   *
   * A coach must be endorsed by the academy either way — endorsement is what an
   * academy's trust in a coach *is* (§1.5.3), and a review decided by somebody
   * outside it would carry weight the academy never granted.
   */
  private async pickCoaches(
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
      return [params.coachUserId];
    }

    const pool = params.coachPool?.filter((id) => candidates.includes(id));
    if (pool?.length) return pool;
    return [await this.leastLoaded(db, candidates)];
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
