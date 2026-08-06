import {
  BadRequestException,
  ConflictException,
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
import { ProcessAService } from './process-a.service';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import { AssignReviewDto, InvitePlayerDto, ReviewDecisionDto } from './dto/review.dto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';

/** The eight a coach scores. Approval needs all of them. */
const ATTRIBUTE_KEYS = [
  'speed',
  'passing',
  'vision',
  'dribbling',
  'finishing',
  'physical',
  'leadership',
  'discipline',
] as const;
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
    private redis: RedisService,
    private endorsements: EndorsementsService,
    private processA: ProcessAService,
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

    /*
     * One recommendation per scout per player.
     *
     * The reputation formula counts accepted over sent (§1.5), so a scout who
     * could file the same player five times would either multiply one good call
     * into five successes or bury one bad call among four duplicates. Either way
     * the success rate stops describing their judgement, which is the only thing
     * it exists to describe.
     */
    const already = await this.prisma.recommendation.findFirst({
      where: { scoutId, playerId: dto.playerId },
      select: { id: true, status: true },
    });
    if (already) {
      throw new ConflictException('You have already recommended this player');
    }

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

      // A loop of upserts, kept deliberately. `academyIds` is capped at five by
      // the DTO, so this is bounded at five fast indexed writes inside an
      // already-open transaction — not an unbounded N. The alternative is a
      // hand-written multi-row `INSERT … ON CONFLICT`, which buys microseconds
      // and costs a piece of raw SQL that silently drifts the day someone renames
      // a column. Revisit only if the cap goes away.
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

  /**
   * This scout's own recommendation for a player, if they have filed one.
   *
   * Drives the button on the player's profile: a scout gets one shot per player
   * (see `create`), so after the first the profile has to say what became of it
   * rather than offering the same button again.
   */
  async myRecommendationFor(scoutId: string, playerId: string) {
    const recommendation = await this.prisma.recommendation.findFirst({
      where: { scoutId, playerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        targets: { select: { academyId: true, status: true } },
      },
    });
    if (!recommendation) return null;

    /*
     * The status a scout cares about is "did anybody take it", not the legacy
     * column: a recommendation addressed to three academies is accepted the
     * moment one of them invites the player.
     */
    const statuses = recommendation.targets.map((target) => target.status);
    const status = statuses.includes('ACCEPTED')
      ? 'ACCEPTED'
      : statuses.length && statuses.every((value) => value === 'REJECTED')
        ? 'REJECTED'
        : recommendation.status === 'ACCEPTED'
          ? 'ACCEPTED'
          : 'PENDING';

    return {
      id: recommendation.id,
      status,
      note: recommendation.note,
      createdAt: recommendation.createdAt,
    };
  }

  /**
   * Where a player stands with the academy this manager runs.
   *
   * The player's own profile is where a manager decides about them, so it needs
   * the same three states the inbox has — nobody has looked yet, a coach has it,
   * a coach has answered — resolved for *their* academy without asking them which
   * one they mean.
   *
   * Null when nobody has recommended this player to that academy: there is no
   * recommendation to send for review, and offering the button anyway would be a
   * button that always fails.
   */
  async academyStateFor(userId: string, playerId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER' },
      select: { academyId: true, academy: { select: { id: true, name: true } } },
    });
    if (!membership) return null;

    const target = await this.prisma.recommendationTarget.findFirst({
      where: { academyId: membership.academyId, recommendation: { playerId } },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        recommendationId: true,
        recommendation: {
          select: {
            note: true,
            scout: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!target) return { academy: membership.academy, recommendation: null, review: null };

    const review = await this.prisma.recommendationReview.findUnique({
      where: { playerId_academyId: { playerId, academyId: membership.academyId } },
      select: {
        id: true,
        status: true,
        note: true,
        decidedAt: true,
        coachUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return {
      academy: membership.academy,
      recommendation: {
        id: target.recommendationId,
        status: target.status,
        note: target.recommendation.note,
        scout: target.recommendation.scout,
      },
      review,
    };
  }

  // ---------- Coach review (§1.9) ----------

  /**
   * Hand a recommended player to an endorsed coach.
   *
   * ## Why a manager cannot just accept
   *
   * The manager runs the academy; the coaches judge football (§1.9). Letting a
   * manager accept a player straight from the inbox would make the coach
   * endorsement decorative and would leave the platform with no credible rating
   * for that player — the ratings that count come out of exactly this step.
   *
   * The coach must be endorsed by *this* academy. An academy's own staff list is
   * not enough: endorsement is the statement "we trust this person's judgement on
   * our behalf", which is precisely what a review is.
   *
   * With no coach named, one is chosen from the endorsed pool by who is carrying
   * the fewest open reviews, ties broken by the earliest endorsement. "Random"
   * was the ask; least-loaded is random's useful cousin and stops one coach
   * collecting the whole inbox by luck.
   */
  async assignReview(userId: string, playerId: string, dto: AssignReviewDto) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    /*
     * The academy is the manager's own, not one read off a recommendation.
     *
     * An academy does not need a scout's permission to look at a player: a
     * manager who finds somebody in search can send them straight to a coach.
     * A recommendation is how a scout puts a player *in front of* an academy —
     * it fills the inbox — and requiring one made scouts a gate on the academy's
     * own judgement.
     */
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER' },
      select: { academyId: true },
    });
    if (!membership) throw new ForbiddenException('Only an academy manager can do that');
    const academyId = membership.academyId;

    // If a scout did recommend this player to us, the review records which one,
    // so accepting it later still moves that scout's reputation.
    const target = await this.prisma.recommendationTarget.findFirst({
      where: { academyId, recommendation: { playerId } },
      orderBy: { createdAt: 'desc' },
      select: { recommendationId: true },
    });
    const recommendationId = target?.recommendationId ?? null;

    /*
     * The same Process A a trial runs. `manual` when the manager named a coach,
     * `auto` when they left it to the academy — one process, and the inbox is
     * simply another way in.
     */
    const review = await this.processA.start({
      playerId,
      academyId,
      mode: dto.coachUserId ? 'manual' : 'auto',
      coachUserId: dto.coachUserId,
      recommendationId,
    });

    if (recommendationId) {
      await this.prisma.recommendationTarget.updateMany({
        where: { recommendationId, academyId },
        data: { status: 'REVIEWING' },
      });
    }

    return review;
  }

  /** The reviews waiting on this coach, with everything the screen renders. */
  async listMyReviews(userId: string, status: 'PENDING' | 'DECIDED' = 'PENDING') {
    const reviews = await this.prisma.recommendationReview.findMany({
      where: {
        coachUserId: userId,
        ...(status === 'PENDING' ? { status: 'PENDING' } : { status: { not: 'PENDING' } }),
      },
      orderBy: { assignedAt: 'desc' },
      take: 50,
      include: {
        academy: { select: { id: true, name: true } },
        // The player hangs off the review, not the recommendation: a review the
        // academy started itself has no recommendation, and the coach still has
        // to see who they are judging.
        player: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            primaryPosition: true,
            region: true,
          },
        },
        recommendation: {
          include: {
            scout: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
          },
        },
      },
    });

    // A review the academy started itself has no recommendation and no scout —
    // the coach's screen shows the player either way.
    return reviews.map((review) => ({
      ...review,
      recommendation: review.recommendation
        ? {
            ...review.recommendation,
            scout: this.storage.withAvatarUrl(review.recommendation.scout),
          }
        : null,
    }));
  }

  /**
   * The coach decides, and their ratings become the player's credible ones.
   *
   * The assessment is written through the same table as any other coach
   * assessment, which is what makes it count: the attribute bars already treat a
   * coach's number as verified evidence and a player's own as a claim (§1.6), so
   * "the rating must count as credible" needs no new concept — it needs the
   * rating to be written by a coach, which is exactly what this is.
   *
   * A rejection ends the line for this academy immediately. An approval does not
   * invite anybody: the coach judges the football, the manager decides whether the
   * academy wants them, and that second step is `invitePlayer`.
   */
  async decideReview(userId: string, reviewId: string, dto: ReviewDecisionDto) {
    const review = await this.prisma.recommendationReview.findUnique({
      where: { id: reviewId },
      include: {
        recommendation: { select: { id: true, playerId: true, scoutId: true } },
        player: { select: { id: true } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.coachUserId !== userId) {
      throw new ForbiddenException('Only the coach this was assigned to can decide it');
    }
    if (review.status !== 'PENDING')
      throw new BadRequestException('This review is already decided');

    const ratings = ATTRIBUTE_KEYS.map((key) => dto[key]);
    const rated = ratings.every((value) => typeof value === 'number');
    if (dto.decision === 'APPROVED' && !rated) {
      throw new BadRequestException('Rate every attribute before approving');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let assessmentId: string | undefined;

      if (rated) {
        const assessment = await tx.coachAssessment.create({
          data: {
            coachUserId: userId,
            coachProfileId: review.coachProfileId,
            playerId: review.playerId,
            speed: dto.speed!,
            passing: dto.passing!,
            vision: dto.vision!,
            dribbling: dto.dribbling!,
            finishing: dto.finishing!,
            physical: dto.physical!,
            leadership: dto.leadership!,
            discipline: dto.discipline!,
            notes: dto.note ?? null,
          },
        });
        assessmentId = assessment.id;
      }

      const updated = await tx.recommendationReview.update({
        where: { id: reviewId },
        data: {
          status: dto.decision,
          note: dto.note ?? null,
          assessmentId: assessmentId ?? null,
          decidedAt: new Date(),
        },
      });

      // A rejection closes this academy's interest now; an approval waits for the
      // manager's invitation, so the target stays in REVIEWING.
      // Only a review that came from a recommendation has a target to close.
      if (dto.decision === 'REJECTED' && review.recommendationId) {
        await tx.recommendationTarget.updateMany({
          where: { recommendationId: review.recommendationId, academyId: review.academyId },
          data: { status: 'REJECTED' },
        });
      }

      /*
       * Process A's answer, written where the trial can read it.
       *
       * TRUE moves the application to SHORTLISTED, which is what unlocks the
       * academy's next move — "Add to squad" on a general trial, "Invite" on a
       * private one. FALSE ends it. The coach never sees the difference: they
       * answered one question about one player.
       */
      if (review.trialApplicationId) {
        await tx.trialApplication.update({
          where: { id: review.trialApplicationId },
          data: { status: dto.decision === 'APPROVED' ? 'SHORTLISTED' : 'REJECTED' },
        });
      }

      return updated;
    });

    // The player's cached profile now has a new assessment on it.
    await this.redis.del(RedisKeys.playerProfile(review.playerId));
    return result;
  }

  /**
   * The manager invites the player, in their own notifications, with a note.
   *
   * Only after a coach approved: inviting on a manager's hunch is the shortcut
   * this whole flow exists to remove. The note is required because "an academy
   * wants you" with no word about what happens next is not an invitation a
   * fourteen-year-old's family can act on.
   *
   * Keyed on the player, since the review may not have come from a scout.
   */
  async invitePlayer(userId: string, playerId: string, dto: InvitePlayerDto) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER' },
      select: { academyId: true, academy: { select: { name: true } } },
    });
    if (!membership) throw new ForbiddenException('Only an academy manager can do that');
    const academyId = membership.academyId;

    const review = await this.prisma.recommendationReview.findUnique({
      where: { playerId_academyId: { playerId, academyId } },
    });
    if (!review || review.status !== 'APPROVED') {
      throw new BadRequestException('A coach has to approve this player first');
    }

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    /*
     * Accepting the recommendation is what moves the scout's success rate and
     * level, so it goes through the existing path rather than a second copy of
     * that logic — but only when a scout was involved. An academy that found the
     * player itself has nobody's reputation to move.
     */
    if (review.recommendationId) {
      await this.updateStatus(userId, review.recommendationId, { status: 'ACCEPTED' });
    }

    await this.notifications.notify(player.userId, 'ACADEMY_INVITATION', {
      academyId,
      academyName: membership.academy.name,
      note: dto.note,
      playerId,
    });

    return { invited: true };
  }

  /**
   * Which academy this manager is acting for on a given recommendation.
   *
   * A recommendation can be addressed to several academies, and the manager only
   * ever acts for their own — resolving it here means no endpoint has to take an
   * academy id it would then have to check they belong to.
   */
  private async academyForManager(
    userId: string,
    recommendation: { academyId: string | null; targets: { academyId: string }[] },
  ) {
    const mine = await this.prisma.academyMember.findMany({
      where: { userId, role: 'MANAGER' },
      select: { academyId: true },
    });
    const ids = new Set(mine.map((row) => row.academyId));

    const candidates = [
      ...(recommendation.academyId ? [recommendation.academyId] : []),
      ...recommendation.targets.map((target) => target.academyId),
    ];
    const match = candidates.find((id) => ids.has(id));
    if (!match) throw new ForbiddenException('This recommendation was not addressed to you');
    return match;
  }

  /**
   * The academy's raw inbox. Joins the player and the scout, because both are
   * rendered and neither can be shown from an id alone.
   */
  async listForAcademy(academyId: string) {
    const rows = await this.prisma.recommendation.findMany({
      where: { academyId },
      orderBy: { createdAt: 'desc' },
      include: {
        player: {
          select: { id: true, firstName: true, lastName: true, birthDate: true },
        },
        scout: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
      },
    });
    return rows.map((row) => ({ ...row, scout: this.storage.withAvatarUrl(row.scout) }));
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

    // One lookup for the whole page, keyed by id. The alternative — letting the
    // inbox resolve names itself — is a request per row on the screen an academy
    // manager opens most, and it is why that screen printed `Player 9f96f84d`.
    const profiles = await this.prisma.playerProfile.findMany({
      where: { id: { in: [...byPlayer.keys()] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        primaryPosition: true,
        region: true,
      },
    });
    const playerOf = new Map(profiles.map((profile) => [profile.id, profile]));

    const items = [...byPlayer.entries()]
      .map(([playerId, entry]) => ({
        playerId,
        player: playerOf.get(playerId) ?? null,
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

    // Where each player stands in the review flow, in one query for the page.
    // Without it the inbox cannot tell "nobody has looked at this yet" from
    // "a coach has it" from "approved, waiting on your invitation".
    const reviews = await this.prisma.recommendationReview.findMany({
      where: {
        academyId,
        recommendationId: { in: items.flatMap((item) => item.recommendationIds) },
      },
      include: {
        coachUser: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
      },
    });
    const reviewOf = new Map(reviews.map((review) => [review.recommendationId, review]));

    return {
      items: items.map((item) => {
        const review = item.recommendationIds.map((id) => reviewOf.get(id)).find(Boolean);
        return {
          ...item,
          review: review
            ? {
                id: review.id,
                recommendationId: review.recommendationId,
                status: review.status,
                note: review.note,
                decidedAt: review.decidedAt,
                coach: this.storage.withAvatarUrl(review.coachUser),
              }
            : null,
        };
      }),
      total: items.length,
    };
  }

  /**
   * What this academy has already settled: invited, or turned down.
   *
   * Separate from the inbox rather than a filter on it, because they answer
   * different questions — the inbox is a queue you work through, this is a record
   * you look things up in — and mixing them made the queue look permanently full.
   */
  async listHistoryForAcademy(userId: string, academyId: string) {
    await this.assertAcademyManager(userId, academyId);

    const targets = await this.prisma.recommendationTarget.findMany({
      where: { academyId, status: { in: ['ACCEPTED', 'REJECTED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        recommendation: {
          include: {
            scout: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
            player: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                birthDate: true,
                primaryPosition: true,
                region: true,
              },
            },
            reviews: {
              where: { academyId },
              include: {
                coachUser: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });

    return targets.map((target) => ({
      recommendationId: target.recommendationId,
      status: target.status,
      decidedAt: target.updatedAt,
      player: target.recommendation.player,
      scout: this.storage.withAvatarUrl(target.recommendation.scout),
      note: target.recommendation.note,
      review: target.recommendation.reviews[0]
        ? {
            status: target.recommendation.reviews[0].status,
            note: target.recommendation.reviews[0].note,
            coach: target.recommendation.reviews[0].coachUser,
          }
        : null,
    }));
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
