import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EndorsementRole, RecommendationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertGenderEligible } from '../trials/trial-eligibility.util';
import { StorageService } from '../storage/storage.service';
import { EndorsementsService } from '../academies/endorsements.service';
import { academyVisibleWeight, contributionOf } from './recommendation-weight.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ProcessAService } from './process-a.service';
import { cooldownEndsAt } from './recommendation-cooldown.util';
import { ageAt } from '../common/age.util';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationDto, pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { richTextToPlain, sanitizeRichText } from '../common/rich-text.util';
import { CreateRecommendationDto, UpdateRecommendationStatusDto } from './dto/recommendation.dto';
import {
  AssignReviewDto,
  CoachAcceptDto,
  InvitePlayerDto,
  ReviewDecisionDto,
} from './dto/review.dto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { TariffsService } from '../tariffs/tariffs.service';

import {
  computeRecommendationCredibility,
  computeScoutLevel,
  computeSuccessRate,
} from './scout-level.util';
import { assertNotLocalTeam, isLocalTeam } from '../academies/academy-kind.util';

/**
 * Roles that may read a scout's profile.
 *
 * `coach` is absent by design, not by omission — see
 * `RecommendationsService.getScoutProfile`. `scout` is absent too: a scout's
 * own page is reachable as themselves, and nothing in the product asks one scout
 * to weigh another's record.
 */
const ALLOWED_SCOUT_VIEWERS = ['player', 'academy_manager', 'admin', 'super_admin'];

/**
 * Enough of the player for a dashboard row to be worth acting on.
 *
 * Name, age and position — the three facts a manager weighs before deciding
 * whether to invite somebody, and the ones the mock-up in the brief shows.
 */
const PENDING_PLAYER_CARD = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  primaryPosition: true,
  region: true,
} as const;

/**
 * Why a coach may not open a review on a player they have found.
 *
 * A code rather than a sentence, because the same four checks answer two
 * different questions: the POST turns them into a 409 the coach reads, and the
 * GET behind the button turns them into an explanation shown *before* they
 * press it. One list, so the button and the endpoint can never disagree about
 * what is allowed.
 */
export type CoachAcceptBlocker =
  | 'NOT_A_COACH'
  | 'LOCAL_TEAM'
  | 'ALREADY_MEMBER'
  | 'ALREADY_APPROVED'
  | 'ALREADY_PENDING'
  | 'OPEN_TRIAL'
  /** Already in one of this academy's open days — Rule 5. */
  | 'GENERAL_TRIAL';

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private redis: RedisService,
    private endorsements: EndorsementsService,
    private processA: ProcessAService,
    private tariffs: TariffsService,
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
     * A scout cannot recommend themselves.
     *
     * The reputation formula counts accepted over sent (§1.5), and it exists to
     * describe a scout's judgement about *other* people. Somebody who both files
     * and is the subject is not exercising judgement, and an accepted
     * self-recommendation would raise their success rate on the strength of an
     * academy's opinion of them as a player — two different things the number
     * would then conflate for ever.
     *
     * Enforced here rather than only in the UI: the endpoint is reachable
     * directly, and hiding the button is a clarity decision, never the boundary.
     */
    if (player.userId === scoutId) {
      throw new ForbiddenException('You cannot recommend your own player profile');
    }

    /*
     * One live recommendation per scout per player, and a wait after a rejection.
     *
     * The reputation formula counts accepted over sent (§1.5), so a scout who
     * could file the same player five times would either multiply one good call
     * into five successes or bury one bad call among four duplicates. Either way
     * the success rate stops describing their judgement, which is the only thing
     * it exists to describe.
     *
     * A rejection does not close the door for good: a fifteen-year-old in
     * February is not the player they are in October, and a scout who was early
     * rather than wrong should be able to say so. But not the next morning —
     * that is arguing with the answer, not bringing new evidence. So the door
     * reopens after RECOMMENDATION_COOLDOWN_MONTHS.
     */
    const already = await this.prisma.recommendation.findFirst({
      where: { scoutId, playerId: dto.playerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, rejectedAt: true, clearedAt: true },
    });
    // A cleared recommendation has already done its work: the player passed a
    // trial and was placed, which is the outcome this scout was right about.
    // There is nothing left to argue with and no cooldown to serve, so if the
    // player is ever on the market again the scout may say so again.
    if (already && !already.rejectedAt && !already.clearedAt) {
      throw new ConflictException('You have already recommended this player');
    }
    if (already?.rejectedAt) {
      const openAt = cooldownEndsAt(already.rejectedAt);
      if (openAt > new Date()) {
        throw new ConflictException(
          `This recommendation was turned down. You can put this player forward again on ${openAt.toISOString().slice(0, 10)}.`,
        );
      }
    }

    /*
     * The plan's ceiling on undecided picks, checked after the duplicate and
     * cooldown rules above.
     *
     * Order matters for what the scout is told: a second attempt at a player
     * they already recommended is a mistake about *that* player, and answering
     * it with "you are out of slots" would send them off to chase academies for
     * verdicts over a recommendation they did not need to file.
     */
    await this.tariffs.assertCanRecommend(scoutId);

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

    // Only SPECIFIC recommendations enter the success-rate denominator, which
    // falls out of counting target rows: a GLOBAL one has none until an academy
    // takes it up. Counting it before then would drag every scout's success rate
    // toward zero for doing something useful (§1.5).
    await this.recalculateScoutStats(scoutId);

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
  async listMine(scoutId: string, dto: PaginationDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const total = await this.prisma.recommendation.count({ where: { scoutId } });

    const rows = await this.prisma.recommendation.findMany({
      where: { scoutId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        player: { select: { id: true, firstName: true, lastName: true } },
        academy: { select: { id: true, name: true } },
        targets: {
          select: { status: true, academy: { select: { id: true, name: true } } },
        },
      },
    });

    const items = rows.map((row) => ({
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

    return pageOf(items, total, { page, pageSize });
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
        rejectedAt: true,
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
          : // A coach turned it down. The academy may have reopened its own
            // review since — that is their business — but for the scout this
            // recommendation was answered, and answered no.
            recommendation.rejectedAt
            ? 'REJECTED'
            : 'PENDING';

    /*
     * When they may put this player forward again, or null if they may not yet
     * — the screen needs the date, not just a disabled button, or the scout is
     * left guessing whether the door ever reopens.
     */
    const openAt = recommendation.rejectedAt ? cooldownEndsAt(recommendation.rejectedAt) : null;

    return {
      id: recommendation.id,
      status,
      note: recommendation.note,
      createdAt: recommendation.createdAt,
      rejectedAt: recommendation.rejectedAt,
      canRecommendAgainAt: openAt && openAt > new Date() ? openAt : null,
      canRecommendAgain: !!openAt && openAt <= new Date(),
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
      // `kind` decides which half of this answer even exists — see below.
      select: { academyId: true, academy: { select: { id: true, name: true, kind: true } } },
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
    /*
     * Where this player stands with the squad, which is the shared half.
     *
     * Both kinds of organisation recruit into a squad the same way (LOCAL_TEAM.md
     * §23), so this is computed for both — but for a local team it is the *only*
     * half, and the panel has nothing else to draw.
     */
    const squad = await this.squadStateFor(membership.academyId, playerId);

    /*
     * A local team stops here, and not as an optimisation.
     *
     * Coaches, the online review and trials do not exist for one (LOCAL_TEAM.md
     * §6–§8) — every endpoint behind them already refuses with 403. Looking them
     * up anyway would be three queries whose only possible answer is "none", and
     * returning `hasCoaches: false` beside a null review is precisely the shape
     * that made the manager's panel offer "Send for review" and then fail on
     * press. What a local team's manager can do about a player is invite them,
     * so that is what this returns.
     */
    if (isLocalTeam(membership.academy.kind)) {
      return {
        academy: membership.academy,
        recommendation: target
          ? {
              id: target.recommendationId,
              status: target.status,
              note: target.recommendation.note,
              scout: target.recommendation.scout,
            }
          : null,
        review: null,
        invitation: null,
        hasCoaches: false,
        squad,
      };
    }

    /*
     * The review is looked up whether or not a scout recommended this player.
     *
     * This used to return early when there was no recommendation target, which
     * meant a manager who sent somebody straight from search saw "Send for
     * review" for ever: the review was created, and this said there wasn't one.
     * An academy does not need a scout's permission to look at a player, so the
     * absence of a recommendation says nothing about whether a review exists.
     */
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

    /*
     * Whether this academy has already invited them.
     *
     * The panel needs it *before* the press: a manager who invites twice gets a
     * 409, and an error explaining a button should not have been offered is a
     * worse answer than not offering it.
     */
    const invitation = await this.prisma.trialApplication.findFirst({
      where: { playerId, trial: { academyId: membership.academyId, type: 'PRIVATE' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        trial: { select: { id: true, title: true, date: true } },
      },
    });

    return {
      academy: membership.academy,
      recommendation: target
        ? {
            id: target.recommendationId,
            status: target.status,
            note: target.recommendation.note,
            scout: target.recommendation.scout,
          }
        : null,
      review,
      invitation: invitation
        ? {
            applicationId: invitation.id,
            status: invitation.status,
            trialId: invitation.trial.id,
            trialTitle: invitation.trial.title,
            date: invitation.trial.date,
          }
        : null,
      /**
       * Whether anybody could take a review if one were sent.
       *
       * `assignReview` refuses with "Add a coach to the academy before sending
       * players for review", which is a true sentence arriving at the worst
       * possible moment. The screen can know first.
       */
      hasCoaches:
        (await this.prisma.academyEndorsement.count({
          where: { academyId: membership.academyId, role: 'COACH', status: 'ACTIVE' },
        })) > 0,
      squad,
    };
  }

  /**
   * Whether this player is already in this organisation's squad, or has been asked.
   *
   * Carries the player's **user** id, because that is what an invitation is
   * addressed to while everything else on this screen is keyed by profile id —
   * and a panel that had to go and look it up separately would be one more
   * request to draw one button.
   *
   * `invitationPending` exists for the same reason `invitation` above does:
   * inviting twice is a 409, and an error explaining that a button should not
   * have been offered is a worse answer than not offering it.
   */
  private async squadStateFor(academyId: string, playerId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (!player) return null;

    const [member, invitation] = await Promise.all([
      this.prisma.academyMember.findUnique({
        where: { academyId_userId: { academyId, userId: player.userId } },
        select: { status: true },
      }),
      this.prisma.academyInvitation.findFirst({
        where: { academyId, userId: player.userId, status: 'PENDING' },
        select: { id: true },
      }),
    ]);

    return {
      userId: player.userId,
      // RELEASED is "was here, is not now", which is a squad they can be invited
      // back into — so only ACTIVE and INACTIVE count as being in it.
      status: member && member.status !== 'RELEASED' ? member.status : null,
      invitationPending: Boolean(invitation),
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

    /*
     * The online coach review is an academy's pipeline, not a local team's.
     *
     * A local team has no coaches, so there is nobody to assign this to — and
     * the review is the step whose verdict later settles recommendations and
     * moves a scout's success rate. Refusing here keeps a local team out of
     * that lifecycle at the only point it could enter it.
     */
    await this.assertIsAcademy(academyId, 'send players for coach review');

    /*
     * TRIAL.md Rule 5: a general trial is decided on the pitch, not online.
     *
     * The manager reaches this from the inbox or from search, where a player
     * looks the same whether or not they are already on one of the academy's own
     * open days. Sending that player to a coach would give one academy two live
     * judgements of the same child by two different processes — and the online
     * one can end in a private trial, which is the pipeline a general applicant
     * is explicitly not in.
     */
    const inOpenDay = await this.openGeneralTrialApplication(playerId, academyId);
    if (inOpenDay) {
      throw new BadRequestException(
        'This player has already applied to one of your open trials, which is decided on the day rather than online',
      );
    }

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
      actor: { userId, role: 'academy_manager' },
    });

    if (recommendationId) {
      await this.prisma.recommendationTarget.updateMany({
        where: { recommendationId, academyId },
        data: { status: 'REVIEWING' },
      });
    }

    return review;
  }

  /**
   * This coach's own review of one player, if an academy gave them the player.
   *
   * Drives the Accept/Reject pair on a player's profile: a coach who has been
   * handed somebody should be able to answer from the page where they are
   * actually reading the clips, rather than finding the same person again in a
   * queue.
   *
   * `null` when nobody assigned them — which is the enforcement, not a UI
   * nicety. A coach may only judge players an academy put in front of them; the
   * decision endpoint checks the same `ReviewCoach` row again before writing,
   * so a hand-made request gains nothing.
   */
  async myReviewFor(userId: string, playerId: string) {
    const review = await this.prisma.recommendationReview.findFirst({
      where: { playerId, assignees: { some: { coachUserId: userId } } },
      orderBy: { assignedAt: 'desc' },
      select: {
        id: true,
        status: true,
        note: true,
        assignedAt: true,
        decidedAt: true,
        academy: { select: { id: true, name: true } },
      },
    });
    return review ?? null;
  }

  /**
   * The reviews waiting on this coach, with everything the screen renders.
   *
   * ## No scout, deliberately
   *
   * A coach is never told who recommended the player. The judgement asked of
   * them is about the player — the clips, the numbers, the position — and
   * knowing that a Legendary Scout put somebody forward is a thumb on the scale
   * before the first clip plays. It would also make the reputation system
   * circular: a scout's standing exists to summarise how their picks were
   * judged, so letting it colour the judging is how a good record starts
   * defending itself.
   *
   * The recommendation's *note* goes too. It is written by a scout and signed by
   * their tone, and there is no way to show it without showing them.
   */
  /**
   * A coach's own review queue, one page at a time.
   *
   * Paginated because it is what the coach's dashboard is built from, and a
   * busy academy's queue is not a screenful. `take: 50` with no total was fine
   * for a page that showed everything it had; it cannot say "12 players, page 1
   * of 3", and it silently stopped at fifty.
   *
   * The avatar comes with the row: the dashboard leads with the player's face,
   * and fetching it per card would be a query per player.
   */
  async listMyReviews(
    userId: string,
    status: 'PENDING' | 'DECIDED' = 'PENDING',
    { page = 1, pageSize = 12 } = {},
  ) {
    const where = {
      // Every coach the review was handed to sees it, not only the one whose
      // id ended up on the row — a trial is worked by a staff. This is also the
      // authorization: a coach can only ever be sent their own assignments.
      assignees: { some: { coachUserId: userId } },
      ...(status === 'PENDING'
        ? { status: 'PENDING' as const }
        : { status: { not: 'PENDING' as const } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.recommendationReview.findMany({
        where,
        orderBy: { assignedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          note: true,
          assignedAt: true,
          decidedAt: true,
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
              secondaryPosition: true,
              dominantFoot: true,
              region: true,
              user: { select: { avatarKey: true } },
            },
          },
        },
      }),
      this.prisma.recommendationReview.count({ where }),
    ]);

    return {
      items: items.map(({ player, ...review }) => {
        const { user, ...profile } = player;
        return {
          ...review,
          player: { ...profile, avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey) },
        };
      }),
      total,
      page,
      pageSize,
    };
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
  /**
   * A coach finds a player themselves and approves them for a trial look.
   *
   * ## This is an online review, not an invitation
   *
   * The only thing new here is *who put the player forward*. A coach browsing
   * player discovery reaches the same decision, on the same row, with the same
   * consequences as one answering a review a manager sent them — and it ends in
   * exactly the same place: an APPROVED review that only the **manager** can act
   * on (TRIAL.md Rule 6, §11). A coach never invites anybody to a trial, never
   * moves an application to INVITED, and never puts anyone in a squad.
   *
   * ## Why it composes the two existing steps rather than writing the row
   *
   * `ProcessA.start` opens the review and assigns the coach; `decideReview`
   * records the answer. Writing an APPROVED row directly would skip everything
   * hanging off that second step — settling the scouts riding on this player,
   * moving their success rates, and the REVIEW_DECIDED notification that tells
   * the manager their move is next. Those are the whole point of the decision,
   * and a shortcut that produced the right status with none of them would look
   * identical in the database and be wrong everywhere else.
   *
   * The coach is assigned to themselves, which is what makes `decideReview`
   * accept them: they are answering a question they asked.
   */

  /**
   * Every player whose next move belongs to the manager.
   *
   * ## Read from state, never from notifications
   *
   * A notification says something happened; this says something is *owed*. If it
   * were built from unread notifications the list would empty when the manager
   * read them, which is precisely when they still have the work to do — and a
   * manager who cleared their notifications would have no way back to the
   * players waiting on them. So each item is derived from the row that makes it
   * true, and disappears only when that row moves on.
   *
   * ## Two kinds of item, from two different tables
   *
   * `INVITE_TO_PRIVATE_TRIAL` — a coach has approved the player and no
   * invitation exists yet. That is an APPROVED review with no live application,
   * whether the manager sent the player for review or a coach found them.
   *
   * `ADD_TO_SQUAD` — a coach passed the player at a real trial, general or
   * private. That is an application at PASSED.
   *
   * A FAIL at either stage produces nothing, which is the asymmetry TRIAL.md
   * states: a rejection is complete on its own and asks the manager for nothing.
   */
  async pendingManagerActions(userId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true },
    });
    if (!membership) throw new ForbiddenException('Only an academy manager can do that');
    const academyId = membership.academyId;

    const [approved, passed] = await Promise.all([
      this.prisma.recommendationReview.findMany({
        where: {
          academyId,
          status: 'APPROVED',
          /*
           * Nothing already in flight.
           *
           * Once the manager has invited, the player is the *player's* to answer
           * — the manager owes nothing until that answer arrives. Filtering on
           * the application rather than on a flag is what makes the item vanish
           * by itself the moment the invitation is sent.
           */
          player: {
            trialApplications: {
              none: {
                status: { in: ['SHORTLISTED', 'INVITED', 'CONFIRMED', 'PASSED', 'ACCEPTED'] },
                trial: { academyId },
              },
            },
          },
        },
        orderBy: { decidedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          source: true,
          decidedAt: true,
          note: true,
          // The coach who answered, so the manager reads a name rather than an id.
          coachUser: { select: { id: true, firstName: true, lastName: true } },
          player: { select: PENDING_PLAYER_CARD },
        },
      }),
      this.prisma.trialApplication.findMany({
        where: { status: 'PASSED', trial: { academyId } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          updatedAt: true,
          trial: { select: { id: true, title: true, type: true, date: true } },
          player: { select: PENDING_PLAYER_CARD },
        },
      }),
    ]);

    return {
      /*
       * `INVITE_TO_PRIVATE_TRIAL` carries the **player** id, not an application
       * id, because there is no application yet — the manager's invitation is
       * what creates one (`invitePlayer`). `ADD_TO_SQUAD` carries the
       * application, which is what `addToSquad` acts on. The two actions take
       * different keys because they act on different things.
       */
      items: [
        ...approved.map((review) => ({
          type: 'INVITE_TO_PRIVATE_TRIAL' as const,
          reviewId: review.id,
          playerId: review.player.id,
          player: review.player,
          source: review.source,
          note: review.note,
          decidedAt: review.decidedAt,
          approvedBy: review.coachUser,
        })),
        ...passed.map((application) => ({
          type: 'ADD_TO_SQUAD' as const,
          applicationId: application.id,
          playerId: application.player.id,
          player: application.player,
          trial: application.trial,
          passedAt: application.updatedAt,
        })),
      ],
    };
  }

  async acceptFromProfile(userId: string, playerId: string, dto: CoachAcceptDto = {}) {
    const found = await this.coachAcademy(userId);
    if (!found.academy) {
      throw new ForbiddenException(
        found.reason === 'LOCAL_TEAM'
          ? 'A local team does not run online reviews'
          : 'Only a coach at an academy can do that',
      );
    }
    const academyId = found.academy.id;

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    /*
     * The four states that make a review pointless or destructive, asked once
     * and shared with the read behind the button — see `coachAcceptBlocker`.
     * The sentences stay here because they are what the coach reads.
     */
    const blocker = await this.coachAcceptBlocker(academyId, playerId, player.userId);
    if (blocker === 'ALREADY_MEMBER') {
      throw new ConflictException('This player is already at your academy');
    }
    if (blocker === 'ALREADY_APPROVED') {
      throw new ConflictException('This player has already been approved for your academy');
    }
    if (blocker === 'ALREADY_PENDING') {
      throw new ConflictException('This player is already waiting on a review at your academy');
    }
    if (blocker === 'OPEN_TRIAL') {
      throw new ConflictException('This player already has an open trial with your academy');
    }
    if (blocker === 'GENERAL_TRIAL') {
      throw new ConflictException(
        'This player has already applied to one of your open trials, which is decided on the day rather than online',
      );
    }

    const review = await this.processA.start({
      playerId,
      academyId,
      mode: 'manual',
      coachUserId: userId,
      actor: { userId, role: 'coach' },
    });

    await this.prisma.recommendationReview.update({
      where: { id: review.id },
      data: { source: 'COACH_DISCOVERED' },
    });

    // The same decision path a review from the inbox takes, so the scouts, the
    // reputations and the manager's notification all move exactly as they would.
    return this.decideReview(userId, review.id, { decision: 'APPROVED', note: dto.note });
  }

  /**
   * The academy a coach is acting for, and why they are acting for none.
   *
   * ## On the staff *and* endorsed — both, at the same academy
   *
   * A coach may only accept a player for an academy they are currently on the
   * coaching staff of. Two rows say that, and the authority is the **overlap**
   * of them, because each one alone lets somebody through who should not be:
   *
   * - `AcademyMember` (role COACH, ACTIVE) is the squad. Alone it is not
   *   enough: `ProcessAService.pickCoaches` opens a review only for an
   *   *endorsed* coach, so a membership-only gate let a coach whose endorsement
   *   had been withdrawn through to a 400 about somebody else's problem.
   * - `AcademyEndorsement` (role COACH, ACTIVE) is the academy's trust
   *   (§1.5.3). Alone it is not enough either: `releaseMember` revokes it when
   *   somebody is expelled, but `updateMember` — the manager standing a coach
   *   down to INACTIVE, or changing their role — does not. A coach who had been
   *   stood down kept an ACTIVE endorsement, and with it the ability to accept
   *   players for a squad they were no longer part of.
   *
   * Requiring both closes each hole with the other, and neither row is the
   * client's to supply: the academy is derived here, from the caller's own
   * membership, so there is no request in which a coach could name a different
   * one. `Accepting coach's academy === review's academy` holds structurally
   * rather than by validation.
   *
   * ## When a coach works for more than one
   *
   * The first academy that took them on — and a local team only if there is no
   * academy at all, since a local team runs no online review and must not be the
   * one picked while a real academy is on offer. Deterministic rather than
   * arbitrary, because the read behind the button and the write have to land on
   * the same academy, and the screen shows its name before anybody confirms.
   */
  private async coachAcademy(userId: string) {
    const [memberships, endorsements] = await Promise.all([
      this.prisma.academyMember.findMany({
        where: { userId, role: 'COACH', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { academy: { select: { id: true, name: true, kind: true } } },
      }),
      this.prisma.academyEndorsement.findMany({
        where: { userId, role: 'COACH', status: 'ACTIVE' },
        select: { academyId: true },
      }),
    ]);

    const endorsed = new Set(endorsements.map((row) => row.academyId));
    const eligible = memberships.filter((row) => endorsed.has(row.academy?.id));

    const academy = eligible.find((row) => row.academy?.kind === 'ACADEMY')?.academy;
    if (academy) {
      return { academy: { id: academy.id, name: academy.name }, reason: null };
    }

    /*
     * `NOT_A_COACH` also covers the coach who *was* one here — stood down, or
     * no longer endorsed. The profile draws nothing for it, which is right:
     * somebody who cannot act should see the page a non-coach sees, not a
     * notice about their own standing on every player they open.
     */
    return {
      academy: null,
      reason: (eligible.length > 0 ? 'LOCAL_TEAM' : 'NOT_A_COACH') as CoachAcceptBlocker,
    };
  }

  /**
   * This academy's own open general trial that the player is already in, if any.
   *
   * ## Rule 5, expressed as a row rather than as a screen
   *
   * A general trial is not screened online: the player applied, they turn up,
   * and a coach judges them on the pitch. So an academy that already has
   * somebody in one of its open days must not also be able to put them through
   * the online review — the two are different answers to the same question, and
   * having both is how a general trial acquires a review it should never have.
   *
   * ## Why each part of the condition is there
   *
   * **`academyId`** — the academy's own trial, not anybody's. A player at Metallurg's
   * open day is an ordinary stranger to Bunyodkor, who may review them like any
   * other. Scoping this to the player alone would mark somebody unreviewable
   * everywhere because one club is looking at them.
   *
   * **`type: 'GENERAL'`** — a private trial is the *outcome* of a review, so a
   * player in one has already been through this and is caught by the separate
   * "already approved" check rather than by this one.
   *
   * **`status: 'OPEN'`** — an archived trial is over. Whatever happened on the
   * day, the academy is no longer testing them through it, and a fresh look is a
   * fresh context (which is also why this is not a permanent mark on a player).
   *
   * **The application statuses** are the domain's own definition of an
   * application still owed an answer — the same set `TrialsService`
   * `archiveIfSettled` counts as outstanding. A player who has been passed,
   * failed or rejected is settled: the general trial has finished with them, and
   * an academy that wants to look again may.
   */
  private async openGeneralTrialApplication(playerId: string, academyId: string) {
    return this.prisma.trialApplication.findFirst({
      where: {
        playerId,
        status: { in: ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INVITED', 'CONFIRMED'] },
        trial: { academyId, type: 'GENERAL', status: 'OPEN' },
      },
      select: { id: true, trial: { select: { id: true, title: true } } },
    });
  }

  /**
   * The four checks a coach's ACCEPT has to survive, or null if it would.
   *
   * Ordered as a coach would read them: the ones about the academy first, then
   * the ones about the pipeline. Shared with `coachDiscoveryState` so the button
   * and the endpoint behind it are answering the same question — a button drawn
   * from one rule and refused by another is worse than no button.
   */
  private async coachAcceptBlocker(
    academyId: string,
    playerId: string,
    playerUserId: string,
  ): Promise<CoachAcceptBlocker | null> {
    /*
     * Somebody already at the academy is not a candidate for its trial.
     *
     * RELEASED is deliberately not counted: a player who left can be looked at
     * again, which is the case this would otherwise block for good.
     */
    const already = await this.prisma.academyMember.findFirst({
      where: { userId: playerUserId, academyId, status: { not: 'RELEASED' } },
      select: { id: true },
    });
    if (already) return 'ALREADY_MEMBER';

    /*
     * One live answer per player per academy.
     *
     * The review row is unique on (player, academy), so a second acceptance
     * would overwrite the first — and if the manager has already acted on it,
     * that first answer is what a live invitation or trial is standing on.
     */
    const existing = await this.prisma.recommendationReview.findUnique({
      where: { playerId_academyId: { playerId, academyId } },
      select: { status: true },
    });
    if (existing?.status === 'APPROVED') return 'ALREADY_APPROVED';
    if (existing?.status === 'PENDING') return 'ALREADY_PENDING';

    const outstanding = await this.prisma.trialApplication.findFirst({
      where: {
        playerId,
        status: { in: ['SHORTLISTED', 'INVITED', 'CONFIRMED'] },
        trial: { academyId, status: 'OPEN' },
      },
      select: { id: true },
    });
    if (outstanding) return 'OPEN_TRIAL';

    /*
     * Rule 5 again, from the coach's side.
     *
     * A coach browsing profiles can land on somebody who has already applied to
     * their own academy's open day — at `APPLIED`, which the check above does
     * not cover. Accepting them there would put a general applicant into the
     * online pipeline just as surely as the manager doing it.
     */
    if (await this.openGeneralTrialApplication(playerId, academyId)) return 'GENERAL_TRIAL';

    return null;
  }

  /**
   * Whether this coach may accept this player, asked before the button is drawn.
   *
   * A read, and only a read. It exists so the profile can say *"already at your
   * academy"* instead of offering a control that answers 409 — the coach learns
   * the state by looking rather than by failing.
   *
   * Answers for everybody, including somebody who is not a coach at all: the
   * caller then simply draws nothing. Refusing here would make an ordinary
   * profile view produce a 403 in the console for every scout and manager.
   */
  async coachDiscoveryState(userId: string, playerId: string) {
    const { academy, reason } = await this.coachAcademy(userId);
    // Not a coach anywhere, or a coach at a local team, which runs no review.
    if (!academy) return { academy: null, canAccept: false, reason };

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const blocker = await this.coachAcceptBlocker(academy.id, playerId, player.userId);
    return { academy, canAccept: blocker === null, reason: blocker };
  }

  async decideReview(userId: string, reviewId: string, dto: ReviewDecisionDto) {
    const review = await this.prisma.recommendationReview.findUnique({
      where: { id: reviewId },
      include: {
        recommendation: { select: { id: true, playerId: true, scoutId: true } },
        player: { select: { id: true } },
      },
    });
    if (!review) throw new NotFoundException('Review not found');

    /*
     * Any assigned coach may answer, and the first who does settles it. Two
     * decisions on one question would leave the academy holding contradictory
     * answers with no rule for which counts — so the row records who answered,
     * and it leaves everybody else's queue.
     */
    const assignment = await this.prisma.reviewCoach.findUnique({
      where: { reviewId_coachUserId: { reviewId, coachUserId: userId } },
    });
    if (!assignment) {
      throw new ForbiddenException('Only a coach this was assigned to can decide it');
    }
    if (review.status !== 'PENDING')
      throw new BadRequestException('This review is already decided');

    /*
     * No attributes here. TRIAL.md Rule 22.
     *
     * An online review asks a coach one question — is this player worth a look —
     * and the answer is yes or no. It is not the place to score somebody: the
     * coach has watched clips, which is enough to say "worth a look" and not
     * enough to say "physical 62". Attribute ratings belong to squad work, where
     * the coach and the player share a group (Rule 21, README §1.9), and a
     * player being screened is in no group of this coach's.
     */

    /** The recommendations this decision answered, for the reputation pass below. */
    let settled: string[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.recommendationReview.update({
        where: { id: reviewId },
        data: {
          status: dto.decision,
          note: dto.note ?? null,
          decidedAt: new Date(),
          // Whoever answered is who the decision is attributable to, whichever
          // of the assigned coaches got to it first.
          coachUserId: userId,
          coachProfileId: assignment.coachProfileId,
        },
      });

      // A rejection closes this academy's interest now; an approval waits for the
      // manager's invitation, so the target stays in REVIEWING.
      // Only a review that came from a recommendation has a target to close.
      if (dto.decision === 'REJECTED') {
        /*
         * What was rejected is the recommendation, not the player.
         *
         * The academy may look at them again tomorrow — a manager can send the
         * same player for review as often as they like. What the answer binds is
         * the *scouts*: filing the same player again the next morning would be
         * arguing with it rather than bringing new evidence, so the cooldown
         * counts from here (see RECOMMENDATION_COOLDOWN_MONTHS).
         *
         * All of them, not only the one the manager happened to be looking at. A
         * player backed by three scouts was put forward by three scouts, and one
         * coach's no answers all three.
         */
        const backings = review.trialApplicationId
          ? await tx.trialApplicationBacking.findMany({
              where: { applicationId: review.trialApplicationId },
              select: { recommendationId: true },
            })
          : [];
        const rejected = new Set(backings.map((row) => row.recommendationId));
        if (review.recommendationId) rejected.add(review.recommendationId);

        if (rejected.size > 0) {
          const ids = [...rejected];
          await tx.recommendationTarget.updateMany({
            where: { recommendationId: { in: ids }, academyId: review.academyId },
            data: { status: 'REJECTED' },
          });
          await tx.recommendation.updateMany({
            where: { id: { in: ids }, rejectedAt: null },
            data: { status: 'REJECTED', rejectedAt: new Date() },
          });
          settled = ids;
        }
      }

      /*
       * The online screening's answer, written where the private trial can read
       * it.
       *
       * ACCEPT moves the application to SHORTLISTED, which is what unlocks the
       * manager's invitation (Rule 6). REJECT ends it. Neither is a trial
       * verdict — nobody has watched this player play yet, and what they do on
       * the day is `TrialsService.recordVerdict`.
       *
       * Private trials only. A general one is never screened online (Rule 5), so
       * it has no review to reach this.
       */
      if (review.trialApplicationId) {
        await tx.trialApplication.update({
          where: { id: review.trialApplicationId },
          data: { status: dto.decision === 'REJECTED' ? 'REJECTED' : 'SHORTLISTED' },
        });
      }

      return updated;
    });

    /*
     * An online REJECT moves every backing scout's success rate — TRIAL.md
     * Rule 10.
     *
     * Outside the transaction on purpose: the reputation is derived state
     * recomputed from the target rows the transaction just wrote, so it is
     * correct whenever it runs and re-running it is free. Holding a transaction
     * open across a fan-out of per-scout recomputes buys nothing and locks the
     * review row for as long as the slowest of them.
     *
     * Note that an ACCEPT is not settled here. A coach approving a *profile* has
     * not said the player is any good on a pitch (§11) — the scout's call is
     * answered by the trial, in `settleTrialBackings`.
     */
    await this.recalculateScoutsBehind(settled);

    /*
     * The manager hears about an ACCEPT, and only an ACCEPT.
     *
     * An accepted player is waiting on them: the invitation to a private trial
     * is the manager's to send, and nothing moves until they do. A rejection
     * asks nothing of anybody — the coach has answered, the line is closed, and
     * a notification would be news about a decision the manager did not make and
     * cannot act on. It is still on the inbox screen, where they go to look.
     */
    if (dto.decision === 'APPROVED') {
      const manager = await this.prisma.academyMember.findFirst({
        where: { academyId: review.academyId, role: 'MANAGER' },
        select: { userId: true },
      });
      if (manager) {
        await this.notifications.notify(
          manager.userId,
          'REVIEW_DECIDED',
          {
            reviewId: review.id,
            playerId: review.playerId,
            academyId: review.academyId,
            status: 'APPROVED',
          },
          { userId, role: 'coach' },
        );
      }
    }

    // The player's cached profile now has a new assessment on it.
    await this.redis.del(RedisKeys.playerProfile(review.playerId));
    return result;
  }

  /**
   * The manager invites the player to a private trial, which this call creates.
   *
   * ## Why the trial is made here rather than chosen
   *
   * A private trial is a session for one named child (TRIAL.md §18) and it comes
   * into being because a coach accepted them and a manager decided to look. It
   * has no existence before that, so there is nothing to pick from a list — the
   * old version made the manager create an empty private trial in advance and
   * hope somebody eventually earned it, and the invite button spent most of its
   * life saying there was nothing to invite anybody to.
   *
   * ## What the invitation is not
   *
   * Not an offer of a place. A coach approving a *profile* is a judgement about
   * clips and numbers — the player has not been on a pitch in front of anybody
   * yet — so what is offered is a look. The trial's coach tests them on the day,
   * and only that second yes puts a squad in reach (Rule 8).
   *
   * The reviewing coach is put on the trial: they are the one who said this
   * player was worth seeing, and somebody has to be able to record the verdict.
   */
  async invitePlayer(userId: string, playerId: string, dto: InvitePlayerDto) {
    // ACTIVE, like `pendingManagerActions` and `inboxAwaitingReviewCount`: this
    // one creates a trial and sends an invitation to a child's family, so a
    // manager who has been stood down must not still be able to send it.
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true, academy: { select: { name: true } } },
    });
    if (!membership) throw new ForbiddenException('Only an academy manager can do that');
    const academyId = membership.academyId;

    // Unreachable for a local team by construction — the approved review below
    // can never exist for one — but stated rather than relied upon, so the rule
    // survives somebody relaxing that precondition.
    await this.assertIsAcademy(academyId, 'invite players from a coach review');

    const review = await this.prisma.recommendationReview.findUnique({
      where: { playerId_academyId: { playerId, academyId } },
    });
    if (!review || review.status !== 'APPROVED') {
      throw new BadRequestException('A coach has to approve this player first');
    }

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: {
        userId: true,
        birthDate: true,
        firstName: true,
        lastName: true,
        primaryPosition: true,
        gender: true,
      },
    });
    if (!player) throw new NotFoundException('Player not found');

    /*
     * The private trial is created for this one player, so it is for their
     * gender — not the column's default, which would file every invited girl
     * under a boys' trial. The same rule that refuses a mismatched applicant
     * on the open board is asserted here, before anything is written, so an
     * invitation can never be the way round it.
     */
    const trialGender = player.gender;
    assertGenderEligible({ gender: trialGender }, player);

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('That is not a date');

    /*
     * One open invitation at a time.
     *
     * Without this, a double-press mints a second private trial and the family
     * receives two invitations to two sessions for the same child. The manager
     * can archive the first from its own screen if the date has to move.
     */
    const outstanding = await this.prisma.trialApplication.findFirst({
      where: {
        playerId,
        status: { in: ['INVITED', 'CONFIRMED'] },
        trial: { academyId, type: 'PRIVATE', status: 'OPEN' },
      },
      select: { id: true },
    });
    if (outstanding) {
      throw new ConflictException('This player already has an open invitation from your academy');
    }

    /*
     * One thing the manager wrote, stored two ways.
     *
     * `note` is the trial's player-facing note and keeps its markup — it is what
     * the player reads on the trial page. `plainNote` is the same words with the
     * tags taken out, for the invitation record and the notification, whose
     * payload is rendered as a string: HTML there arrives on a phone as literal
     * angle brackets.
     */
    const note = sanitizeRichText(dto.note);
    const plainNote = richTextToPlain(note) || dto.note.trim();

    const application = await this.prisma.$transaction(async (tx) => {
      const trial = await tx.trial.create({
        data: {
          academyId,
          type: 'PRIVATE',
          gender: trialGender,
          title: `Private trial — ${player.firstName} ${player.lastName}`,
          location: dto.location.trim(),
          date,
          /*
           * No deadline on a private trial.
           *
           * A deadline exists to close a *list* before the academy has to plan
           * around its size. A private trial has no list — it is one named
           * child, already chosen — so there is nothing to close, and a date
           * here would only be a second way for the invitation to expire.
           */
          applyDeadline: null,
          note,
          /*
           * No eligibility rules at all.
           *
           * An age range and a position list answer "may I apply?", and nobody
           * may: this trial is for one named child who has already been chosen
           * and screened. Writing their own age there made a fact about one
           * person look like a rule, and the player was then shown it as a
           * restriction they had passed.
           */
          ageRangeMin: null,
          ageRangeMax: null,
          positions: [],
          // The coach who accepted them, so somebody can record the verdict.
          coaches: { create: { coachUserId: review.coachUserId } },
        },
      });

      return tx.trialApplication.create({
        data: {
          trialId: trial.id,
          playerId,
          // Straight to INVITED: the screening this trial exists because of has
          // already happened, and it is the player's answer that is awaited now.
          status: 'INVITED',
          inviteNote: plainNote,
          recommendationId: review.recommendationId,
        },
        include: { trial: true },
      });
    });

    // Every scout who put this player forward is riding on the trial's answer.
    await this.processA.snapshotBackings(application.id, playerId, academyId);

    await this.notifications.notify(
      player.userId,
      'TRIAL_INVITATION',
      {
        applicationId: application.id,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        academyId,
        academyName: membership.academy.name,
        status: 'INVITED',
        note: plainNote,
      },
      { userId, role: 'academy_manager' },
    );

    return application;
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

    /*
     * Who has already been invited, so the row stops offering the button.
     *
     * An approved player does not leave the inbox when the invitation goes out —
     * the recommendation is not settled until the trial answers it (§28), so the
     * target row is still REVIEWING. Without this the manager would be offered
     * "invite" for ever on somebody they had already invited, and the second
     * press would 409.
     */
    const invitations = await this.prisma.trialApplication.findMany({
      where: {
        playerId: { in: [...byPlayer.keys()] },
        status: { in: ['INVITED', 'CONFIRMED'] },
        trial: { academyId, type: 'PRIVATE' },
      },
      select: {
        id: true,
        playerId: true,
        status: true,
        trial: { select: { id: true, date: true } },
      },
    });
    const invitationOf = new Map(invitations.map((row) => [row.playerId, row]));

    /*
     * An invited player has left the queue.
     *
     * The recommendation is not *settled* — the trial has not answered it yet
     * (§28), so the target row is still REVIEWING and cannot be filtered on. But
     * the academy has done everything the inbox asks of it, and a queue that
     * keeps rows nobody can act on stops being a queue. They appear in the
     * history instead, which is where `listHistoryForAcademy` picks them up.
     */
    const invited = await this.invitedPlayerIds(
      academyId,
      items.map((item) => item.playerId),
    );

    const rows = items
      .filter((item) => !invited.has(item.playerId))
      .map((item) => {
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
      });

    return { items: rows, total: rows.length };
  }

  /**
   * How many players are sitting in the inbox that nobody has been asked about.
   *
   * Drives the badge on the manager's Inbox entry. "New" means *not yet sent for
   * online review* rather than unread: the inbox is a queue of work, and the
   * work is handing a player to a coach. A player a coach is already looking at
   * has been dealt with as far as the manager is concerned, even though the
   * verdict has not come back.
   *
   * Counted the same way `listRankedForAcademy` builds its list — distinct
   * players with an undecided target for this academy — so the badge and the
   * screen behind it can never disagree. `RecommendationReview` is unique on
   * (player, academy), so "has been sent" is one row either existing or not.
   *
   * The academy is resolved from the caller rather than taken as a parameter:
   * the header drawing this badge knows who is signed in and nothing else.
   */
  async inboxAwaitingReviewCount(userId: string) {
    const managed = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true },
    });
    if (!managed) return { count: 0, academyId: null };

    const targets = await this.prisma.recommendationTarget.findMany({
      where: { academyId: managed.academyId, status: { in: ['PENDING', 'REVIEWING'] } },
      select: { recommendation: { select: { playerId: true } } },
    });

    const playerIds = [...new Set(targets.map((target) => target.recommendation.playerId))];
    if (playerIds.length === 0) return { count: 0, academyId: managed.academyId };

    const reviewed = await this.prisma.recommendationReview.findMany({
      where: { academyId: managed.academyId, playerId: { in: playerIds } },
      select: { playerId: true },
    });
    const sent = new Set(reviewed.map((review) => review.playerId));

    return {
      count: playerIds.filter((playerId) => !sent.has(playerId)).length,
      academyId: managed.academyId,
    };
  }

  /** Which of these players this academy has an open private trial for. */
  private async invitedPlayerIds(academyId: string, playerIds: string[]) {
    if (playerIds.length === 0) return new Set<string>();
    const rows = await this.prisma.trialApplication.findMany({
      where: {
        playerId: { in: playerIds },
        trial: { academyId, type: 'PRIVATE' },
      },
      select: { playerId: true },
    });
    return new Set(rows.map((row) => row.playerId));
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

    /*
     * Two ways a player leaves the queue, and both belong here.
     *
     * A rejection settles the target row, so it is found by status. An
     * *invitation* does not — the scout's recommendation is answered by the
     * trial, not by the invitation (§28) — so an invited player's target sits at
     * REVIEWING for weeks. Filtering on status alone lost them from both lists:
     * gone from the queue by the exclusion in `listRankedForAcademy`, absent
     * from the history because nothing had been decided yet.
     */
    const invitations = await this.prisma.trialApplication.findMany({
      where: { trial: { academyId, type: 'PRIVATE' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        playerId: true,
        status: true,
        createdAt: true,
        trial: { select: { id: true, date: true, title: true } },
      },
    });
    const invitationOf = new Map(invitations.map((row) => [row.playerId, row]));

    const targets = await this.prisma.recommendationTarget.findMany({
      where: {
        academyId,
        OR: [
          { status: { in: ['ACCEPTED', 'REJECTED'] } },
          // Invited: settled from the academy's point of view even though the
          // scout's recommendation is still open.
          { recommendation: { playerId: { in: [...invitationOf.keys()] } } },
        ],
      },
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

    return targets.map((target) => {
      const invitation = invitationOf.get(target.recommendation.playerId);
      return {
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
        /**
         * The private trial this player was invited to, if one exists.
         *
         * Carries the trial's own date rather than the invitation's: what a
         * manager looking back wants is when the session is, not when they
         * pressed the button.
         */
        invitation: invitation
          ? {
              applicationId: invitation.id,
              status: invitation.status,
              trialId: invitation.trial.id,
              trialTitle: invitation.trial.title,
              date: invitation.trial.date,
            }
          : null,
      };
    });
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
        // This *is* `Player.recommendations`, so a trial PASS empties it
        // (TRIAL.md Rule 13). The rows survive as the scouts' record — see
        // `clearPlayerRecommendations` — but they are no longer backing anybody.
        where: { playerId, clearedAt: null },
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
   *
   * The inbox only. A trial's verdict settles the same rows through
   * `settleTrialBackings`, which reaches them as a coach rather than a manager
   * and so cannot come through here.
   */
  async updateStatus(userId: string, recommendationId: string, dto: UpdateRecommendationStatusDto) {
    const recommendation = await this.prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: { targets: true },
    });
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    /*
     * A global recommendation is a scout saying "somebody should look at this
     * player" — addressed to nobody, so no academy can accept or reject it from
     * its inbox, where it never appears. The one thing that can settle it is an
     * academy actually putting the player through a trial, which is the moment
     * it becomes addressed to somebody; `settleTrialBackings` takes it up there.
     */
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

    /*
     * REVIEWING is not a verdict — it says the academy has picked this one up,
     * and nothing has been decided. No reputation moves and nobody is notified,
     * so it is a plain state write rather than a settlement.
     */
    if (dto.status === 'REVIEWING') {
      return this.prisma.recommendationTarget.update({
        where: { recommendationId_academyId: { recommendationId, academyId } },
        data: { status: 'REVIEWING' },
      });
    }

    return this.settleTarget({
      recommendationId,
      scoutId: recommendation.scoutId,
      playerId: recommendation.playerId,
      academyId,
      status: dto.status,
      soleTarget: recommendation.targets.length === 1,
      actor: { userId, role: 'academy_manager' },
    });
  }

  /**
   * Settle every scout riding on a trial — TRIAL.md Rules 10-12.
   *
   * A player rarely arrives on one scout's word, and the trial answers all of
   * them at once: PASS is every backing scout being right, FAIL is every one of
   * them being turned down together.
   *
   * No permission check here, deliberately. The authority is the coach's verdict,
   * which the caller has already established — and the coach is not a manager of
   * this academy, so routing them through `updateStatus` would fail the one
   * check that endpoint exists to make.
   */
  async settleTrialBackings(params: {
    recommendationIds: string[];
    academyId: string;
    status: 'ACCEPTED' | 'REJECTED';
    /** The coach whose verdict settled them. */
    actor: { userId: string; role: string };
  }) {
    for (const recommendationId of params.recommendationIds) {
      const recommendation = await this.prisma.recommendation.findUnique({
        where: { id: recommendationId },
        include: { targets: true },
      });
      if (!recommendation) continue;

      let target = recommendation.targets.find((t) => t.academyId === params.academyId);

      /*
       * A GLOBAL recommendation names no academy, so ordinarily none can settle
       * it — but the academy that has now put the player through a trial *is* the
       * somebody it was addressed to, and the scout's call stands or falls with
       * the outcome like everybody else's.
       */
      if (!target) {
        if (recommendation.type !== RecommendationType.GLOBAL) continue;
        target = await this.prisma.recommendationTarget.create({
          data: { recommendationId, academyId: params.academyId },
        });
      }

      // Already answered by this academy — a second verdict is not a second
      // decision, and one settled recommendation must not stop the others.
      if (target.status === 'ACCEPTED' || target.status === 'REJECTED') continue;

      await this.settleTarget({
        recommendationId,
        scoutId: recommendation.scoutId,
        playerId: recommendation.playerId,
        academyId: params.academyId,
        status: params.status,
        soleTarget: recommendation.targets.length <= 1,
        actor: params.actor,
      });
    }
  }

  /**
   * One academy's verdict on one recommendation, and the reputation that follows.
   *
   * Everything after the decision, shared by the two callers that reach it very
   * differently: the inbox, which first checks the caller manages the deciding
   * academy, and a trial verdict, which is already a coach's judgement and needs
   * no second permission. What they have in common starts here.
   */
  private async settleTarget(params: {
    recommendationId: string;
    scoutId: string;
    playerId: string;
    academyId: string;
    status: 'ACCEPTED' | 'REJECTED';
    /** Whether the legacy `Recommendation.status` column can mirror this verdict. */
    soleTarget: boolean;
    /** Who settled it — a manager from the inbox, or a coach through a verdict. */
    actor: { userId: string; role: string };
  }) {
    const { recommendationId, academyId, status } = params;

    const updated = await this.prisma.recommendationTarget.update({
      where: { recommendationId_academyId: { recommendationId, academyId } },
      data: { status },
    });

    /*
     * A recommendation that was turned down and then accepted after all is not
     * one the scout should still be serving a cooldown for — they were right,
     * and the clock was started by an answer that has since been overtaken. A
     * rejection starts it: filing the same player again the next morning is
     * arguing with the answer rather than bringing new evidence.
     */
    await this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        rejectedAt: status === 'ACCEPTED' ? null : new Date(),
        // Mirror onto the recommendation for single-target rows, so existing
        // reads that still look at `status` stay truthful.
        ...(params.soleTarget ? { status } : {}),
      },
    });

    if (status === 'ACCEPTED') {
      await this.notifications.notify(
        params.scoutId,
        'RECOMMENDATION_ACCEPTED',
        { recommendationId, playerId: params.playerId, academyId },
        params.actor,
      );

      const player = await this.prisma.playerProfile.findUnique({
        where: { id: params.playerId },
      });
      if (player) {
        await this.notifications.notify(
          player.userId,
          'RECOMMENDATION_ACCEPTED',
          { recommendationId, academyId },
          params.actor,
        );
      }
    } else {
      await this.notifications.notify(
        params.scoutId,
        'RECOMMENDATION_REJECTED',
        { recommendationId, playerId: params.playerId, academyId },
        params.actor,
      );
    }

    await this.recalculateScoutStats(params.scoutId);

    return updated;
  }

  /**
   * Empty a player's live recommendations — TRIAL.md Rule 13.
   *
   * Only ever called on a trial PASS. Not a delete: §8 recalculates the backing
   * scouts' success rates immediately afterwards, from these very rows, so
   * destroying them would destroy the thing the rule is protecting. What clears
   * is the player's live backing — nobody is still asking for them to be looked
   * at once they have been placed — and the discoverability weight those
   * recommendations bought goes with it, or the profile would keep a boost from
   * recommendations it no longer shows.
   */
  async clearPlayerRecommendations(playerId: string) {
    await this.prisma.$transaction([
      this.prisma.recommendation.updateMany({
        where: { playerId, clearedAt: null },
        data: { clearedAt: new Date() },
      }),
      this.prisma.playerRecommendationWeight.updateMany({
        where: { playerId },
        data: { globalWeight: 0, recommendationCount: 0 },
      }),
      this.prisma.playerAcademyRecommendationWeight.updateMany({
        where: { playerId },
        data: { extraWeight: 0, recommendationCount: 0 },
      }),
    ]);
  }

  /** Recompute the success rate of whoever filed these recommendations. */
  private async recalculateScoutsBehind(recommendationIds: string[]) {
    if (recommendationIds.length === 0) return;
    const rows = await this.prisma.recommendation.findMany({
      where: { id: { in: recommendationIds } },
      select: { scoutId: true },
    });
    for (const scoutId of new Set(rows.map((row) => row.scoutId))) {
      await this.recalculateScoutStats(scoutId);
    }
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

  /**
   * A scout's public reputation page — who they are and how good their calls are.
   *
   * ## Not visible to coaches
   *
   * A coach's job is to answer "is this player worth a look" from the player's
   * clips and nothing else (§1.9, TRIAL.md Rule 22). Letting them open the
   * profile of the scout who filed the recommendation puts a Legendary badge
   * beside the request, and a coach who knows a Level 6 scout is asking is no
   * longer answering the same question — the review starts measuring the scout's
   * reputation instead of the player's football. That is exactly the pressure
   * this refusal removes, and it is why the rule is a refusal rather than a
   * hidden link: a coach who reaches the URL directly must be told no too.
   *
   * Players and academies are the audiences it exists for. A player wants to
   * know who put them forward; an academy weighs the recommendation by the record
   * of whoever made it, which is the whole point of §1.5.
   *
   * ## No list of players
   *
   * Counts and endorsements, never the names. A scout's picks are a list of
   * minors, and publishing one would be a public index of children assembled by
   * how promising somebody thinks they are (§11.3, §21.5).
   */
  async getScoutProfile(scoutUserId: string, viewer: AuthUser) {
    this.assertMaySeeScout(scoutUserId, viewer);

    const user = await this.prisma.user.findUnique({
      where: { id: scoutUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarKey: true,
        createdAt: true,
        isActive: true,
        isPrivate: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user || !user.roles.some((entry) => entry.role.name === 'scout')) {
      throw new NotFoundException('Scout not found');
    }

    // A private account is unlisted for everyone but itself and admins — the same
    // rule UsersService.findPublicProfile applies, kept identical on purpose.
    const isSelf = viewer.userId === scoutUserId;
    const isAdmin = viewer.roles.some((role) => role === 'admin' || role === 'super_admin');
    if (user.isPrivate && !isSelf && !isAdmin) throw new NotFoundException('Scout not found');

    const [stats, endorsements, pendingCount] = await Promise.all([
      this.getScoutStats(scoutUserId),
      this.endorsements.listForUser(scoutUserId, EndorsementRole.SCOUT),
      this.prisma.recommendation.count({
        where: {
          scoutId: scoutUserId,
          clearedAt: null,
          targets: { some: { status: { in: ['PENDING', 'REVIEWING'] } } },
        },
      }),
    ]);

    const { avatarKey, isPrivate, roles, ...identity } = user;
    return {
      ...identity,
      avatarUrl: this.storage.publicUrlOrNull(avatarKey),
      stats: {
        level: stats.level,
        weight: stats.weight,
        successRate: stats.successRate,
        totalRecommendations: stats.totalRecommendations,
        acceptedRecommendations: stats.acceptedRecommendations,
        pendingRecommendations: pendingCount,
      },
      endorsements,
    };
  }

  /**
   * Where this scout stands with the academy the viewer runs.
   *
   * Returned inside the profile rather than from a route of its own, because the
   * screen cannot draw its one button without it: "invite", "waiting on them"
   * and "endorse" are the same control in three states, and fetching the state
   * separately would render the wrong one first and then swap it under the
   * manager's finger.
   *
   * Null for anybody who does not manage an academy — which is most readers of
   * this page, including the scout themselves.
   */
  private async academyStandingFor(viewer: AuthUser, scoutUserId: string) {
    if (!viewer.roles.includes('academy_manager')) return null;

    const managed = await this.prisma.academyMember.findFirst({
      where: { userId: viewer.userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true, academy: { select: { name: true, status: true } } },
    });
    if (!managed) return null;

    const [member, invitation, endorsement] = await Promise.all([
      this.prisma.academyMember.findUnique({
        where: { academyId_userId: { academyId: managed.academyId, userId: scoutUserId } },
        select: { role: true, status: true },
      }),
      this.prisma.academyInvitation.findFirst({
        where: { academyId: managed.academyId, userId: scoutUserId, status: 'PENDING' },
        select: { id: true, createdAt: true },
      }),
      this.prisma.academyEndorsement.findFirst({
        where: {
          academyId: managed.academyId,
          userId: scoutUserId,
          role: EndorsementRole.SCOUT,
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);

    return {
      academyId: managed.academyId,
      academyName: managed.academy.name,
      /// Only a verified academy's scouts get the private-profile access that
      /// membership grants, so the screen has to be able to say why not.
      verified: managed.academy.status === 'VERIFIED',
      // RELEASED is "we are done with them", which reads as not on the books.
      isMember: !!member && member.status !== 'RELEASED',
      invitationPending: !!invitation,
      isEndorsed: !!endorsement,
    };
  }

  /**
   * Who may open a scout's profile. Keyed on the **active** role, so a coach who
   * is also a manager must be acting as the manager — same rule as everywhere
   * else (JwtStrategy.validate).
   */
  private assertMaySeeScout(scoutUserId: string, viewer: AuthUser) {
    if (viewer.userId === scoutUserId) return;

    const acting = viewer.roles;
    if (acting.includes('coach') && !acting.some((role) => ALLOWED_SCOUT_VIEWERS.includes(role))) {
      throw new ForbiddenException(
        'A coach reviews the player, not the scout who put them forward. Scout profiles are not shown here.',
      );
    }
    if (!acting.some((role) => ALLOWED_SCOUT_VIEWERS.includes(role))) {
      throw new ForbiddenException('Scout profiles are visible to players and academies');
    }
  }

  /**
   * The scout's reputation, plus how much of their plan's pending allowance is
   * spoken for.
   *
   * The quota travels with the stats because the two are read by the same card
   * and answer the same question — "how am I doing, and can I file another one".
   * Split across two requests, the screen would keep showing a live "recommend"
   * button to a scout whose next attempt is going to be refused.
   */
  async getScoutStats(userId: string) {
    const [stats, pending, sentRecommendations] = await Promise.all([
      this.prisma.scoutStats.findUnique({ where: { userId } }),
      this.tariffs.pendingRecommendationQuota(userId),
      /*
       * How many recommendations this scout has actually filed.
       *
       * Deliberately *not* `stats.totalRecommendations`, which counts target rows
       * because that is the denominator the §1.5 success rate is defined on — a
       * GLOBAL recommendation has no targets and is free until an academy takes
       * it up. That is correct for reputation and wrong for a card labelled
       * "Yuborilgan": a scout who had sent two was reading zero.
       *
       * So the formula keeps its denominator and the label gets its own number.
       */
      this.prisma.recommendation.count({ where: { scoutId: userId } }),
    ]);

    return {
      ...(stats ?? {
        userId,
        totalRecommendations: 0,
        acceptedRecommendations: 0,
        successRate: 0,
        level: 1,
        weight: 1,
      }),
      pending,
      sentRecommendations,
    };
  }

  /**
   * Recomputes success_rate, level and weight per README 1.5 formula/tiers.
   *
   * Counted from the target rows rather than nudged by a delta, because TRIAL.md
   * §28 asks for a *recalculation* after each finalized outcome and there are now
   * five places one can happen — the inbox, an online REJECT, a trial PASS, a
   * trial FAIL, and filing a new recommendation. Five deltas that must each be
   * applied exactly once is a drift the platform cannot detect; a recomputation
   * is idempotent, so a retry, a double-fire or a backfill all land on the same
   * number.
   *
   * The denominator is target rows, which is what makes a GLOBAL recommendation
   * free until somebody takes it up: it has no targets until then. The formula
   * itself is untouched — see scout-level.util.ts, which is spec-verbatim.
   */
  private async recalculateScoutStats(userId: string) {
    const [totalRecommendations, acceptedRecommendations] = await this.prisma.$transaction([
      this.prisma.recommendationTarget.count({ where: { recommendation: { scoutId: userId } } }),
      this.prisma.recommendationTarget.count({
        where: { recommendation: { scoutId: userId }, status: 'ACCEPTED' },
      }),
    ]);

    const successRate = computeSuccessRate(totalRecommendations, acceptedRecommendations);
    const tier = computeScoutLevel(totalRecommendations, successRate);

    return this.prisma.scoutStats.upsert({
      where: { userId },
      create: {
        userId,
        totalRecommendations,
        acceptedRecommendations,
        successRate,
        level: tier.level,
        weight: tier.weight,
      },
      update: {
        totalRecommendations,
        acceptedRecommendations,
        successRate,
        level: tier.level,
        weight: tier.weight,
      },
    });
  }

  /** Refuses the coach-review pipeline to a local team. See academy-kind.util. */
  private async assertIsAcademy(academyId: string, action: string) {
    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { kind: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');
    assertNotLocalTeam(academy.kind, action);
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
