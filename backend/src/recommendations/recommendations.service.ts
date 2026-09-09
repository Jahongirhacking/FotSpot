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
import { TrialBackingsService } from './trial-backings.service';
import { cooldownEndsAt } from './recommendation-cooldown.util';
import { ageAt } from '../common/age.util';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationDto, pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { richTextToPlain, sanitizeRichText } from '../common/rich-text.util';
import {
  CreateRecommendationDto,
  InvitePlayerDto,
  UpdateRecommendationStatusDto,
} from './dto/recommendation.dto';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { TariffsService } from '../tariffs/tariffs.service';

import {
  computeRecommendationCredibility,
  computeScoutLevel,
  computeSuccessRate,
} from './scout-level.util';
import { assertNotLocalTeam, isLocalTeam } from '../academies/academy-kind.util';
import { OPEN_APPLICATION_STATUSES } from '../trials/application-stage.util';

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
/**
 * Why a player cannot be recommended right now. `IN_ACADEMY` — they are on an
 * academy's books (a local team does not count); `IN_TRIAL` — an academy is
 * already looking at them on a pitch, or has just offered them a place.
 */
export type RecommendBlocker = 'IN_ACADEMY' | 'IN_TRIAL';

const RECOMMEND_BLOCKER_MESSAGE: Record<RecommendBlocker, string> = {
  IN_ACADEMY: 'This player is already at an academy and cannot be recommended',
  IN_TRIAL: 'This player is in a trial process and cannot be recommended until it ends',
};

const PENDING_PLAYER_CARD = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  gender: true,
  primaryPosition: true,
  region: true,
  district: true,
  // The manager's card wants a face on it.
  user: { select: { avatarKey: true } },
} as const;

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private redis: RedisService,
    private endorsements: EndorsementsService,
    private backings: TrialBackingsService,
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

    // Nobody to say it to, or nothing to add — see `recommendEligibility`.
    const blocker = await this.recommendBlocker(player.id, player.userId);
    if (blocker) throw new ConflictException(RECOMMEND_BLOCKER_MESSAGE[blocker]);

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
  /**
   * Whether a scout may put this player forward at all, and if not, why.
   *
   * A recommendation is a scout saying "look at this player". There is nobody
   * to say it to about a player an academy already has, and nothing to add
   * about one an academy is already looking at on a pitch. So a player with an
   * academy membership (a local team does not count — TRIAL.md §5) or an open
   * trial application — applied, invited, confirmed, passed and awaiting the
   * squad decision, or offered a place — cannot be recommended, and the
   * profile says why instead of drawing a button that would fail.
   */
  async recommendEligibility(playerId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
    if (!player) throw new NotFoundException('Player not found');
    const reason = await this.recommendBlocker(playerId, player.userId);
    return { canRecommend: reason === null, reason };
  }

  private async recommendBlocker(
    playerId: string,
    playerUserId: string,
  ): Promise<RecommendBlocker | null> {
    const [member, application] = await Promise.all([
      this.prisma.academyMember.findFirst({
        where: {
          userId: playerUserId,
          role: 'PLAYER',
          status: { in: ['ACTIVE', 'INACTIVE'] },
          academy: { kind: 'ACADEMY' },
        },
        select: { id: true },
      }),
      this.prisma.trialApplication.findFirst({
        where: { playerId, status: { in: [...OPEN_APPLICATION_STATUSES] } },
        select: { id: true },
      }),
    ]);
    if (member) return 'IN_ACADEMY';
    if (application) return 'IN_TRIAL';
    return null;
  }

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
          : // The academy turned it down, or a trial failed. The academy may
            // have invited them again since — that is their business — but for
            // the scout this recommendation was answered, and answered no.
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
   * Where a player stands with the academy this viewer works for.
   *
   * The player's own profile is where an academy decides about them, so the
   * panel there needs the answer resolved for *their* academy without asking
   * which one they mean: whether the player is already invited to a private
   * trial, already in the squad, and whether there is anybody to run a trial.
   *
   * Answered for a manager and for an endorsed coach alike — both may invite a
   * player to a private trial (§11) — and `role` says which the viewer is, so
   * the panel knows whether to ask them to name a coach. Null for everybody
   * else: there is no academy to stand with.
   */
  async academyStateFor(userId: string, playerId: string) {
    const membership = await this.viewerAcademy(userId);
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
     * Coaches and trials do not exist for one (LOCAL_TEAM.md
     * §6–§8) — every endpoint behind them already refuses with 403. Looking them
     * up anyway would be three queries whose only possible answer is "none", and
     * returning `hasCoaches: false` beside a null invitation is precisely the
     * shape that made the manager's panel offer a trial invitation and then
     * fail on press. What a local team's manager can do about a player is
     * invite them to the squad, so that is what this returns.
     */
    if (isLocalTeam(membership.academy.kind)) {
      return {
        academy: membership.academy,
        role: membership.role,
        recommendation: target
          ? {
              id: target.recommendationId,
              status: target.status,
              note: target.recommendation.note,
              scout: target.recommendation.scout,
            }
          : null,
        invitation: null,
        hasCoaches: false,
        squad,
      };
    }

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
      role: membership.role,
      recommendation: target
        ? {
            id: target.recommendationId,
            status: target.status,
            note: target.recommendation.note,
            scout: target.recommendation.scout,
          }
        : null,
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
       * Whether anybody could run a private trial if one were arranged. The
       * invitation refuses without a coach to name, which is a true sentence
       * arriving at the worst possible moment; the screen can know first. A
       * coach asking is that somebody, so for them it is simply true.
       */
      hasCoaches:
        membership.role === 'COACH' ||
        (await this.prisma.academyEndorsement.count({
          where: { academyId: membership.academyId, role: 'COACH', status: 'ACTIVE' },
        })) > 0,
      squad,
    };
  }

  /**
   * The academy this viewer speaks for on a player's profile, and as what.
   *
   * The same two answers `inviterFor` gives — a manager's membership, or a
   * coach's membership backed by an endorsement — without the refusal, because
   * a profile is read by plenty of people who stand with no academy at all.
   */
  private async viewerAcademy(userId: string) {
    const select = {
      academyId: true,
      academy: { select: { id: true, name: true, kind: true } },
    } as const;
    const manager = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select,
    });
    if (manager) return { ...manager, role: 'MANAGER' as const };

    const coach = await this.prisma.academyMember.findFirst({
      where: {
        userId,
        role: 'COACH',
        status: 'ACTIVE',
        academy: { endorsements: { some: { userId, role: 'COACH', status: 'ACTIVE' } } },
      },
      select,
    });
    return coach ? { ...coach, role: 'COACH' as const } : null;
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

  // ---------- The manager's desk ----------

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
   * ## One kind of item
   *
   * `ADD_TO_SQUAD` — a coach passed the player at a real trial, general or
   * private. That is an application at PASSED.
   *
   * A FAIL at either stage produces nothing, which is the asymmetry TRIAL.md
   * states: a rejection is complete on its own and asks the manager for nothing.
   */
  async pendingManagerActions(userId: string, { page = 1, pageSize = 4 } = {}) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true },
    });
    if (!membership) throw new ForbiddenException('Only an academy manager can do that');
    const academyId = membership.academyId;

    // Newest pass first: the dashboard shows the top few and links to the rest.
    const where = { status: 'PASSED' as const, trial: { academyId } };
    const [passed, total] = await Promise.all([
      this.prisma.trialApplication.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          updatedAt: true,
          trial: { select: { id: true, title: true, type: true, date: true } },
          player: { select: PENDING_PLAYER_CARD },
        },
      }),
      this.prisma.trialApplication.count({ where }),
    ]);

    return {
      // One kind of item: a player a trial has passed, waiting for a squad place
      // (TRIAL.md Rule 8). `applicationId` is what `addToSquad` acts on.
      items: [
        ...passed.map(({ player: { user, ...player }, ...application }) => ({
          type: 'ADD_TO_SQUAD' as const,
          applicationId: application.id,
          playerId: player.id,
          player: { ...player, avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey) },
          trial: application.trial,
          passedAt: application.updatedAt,
        })),
      ],
      total,
      page,
      pageSize,
    };
  }

  /**
   * A private trial for one player — TRIAL.md §11.
   *
   * ## Who may, and who runs it
   *
   * An academy manager or an academy coach, from the player's profile or the
   * inbox. The trial is created here, for this player alone, with the one coach
   * who will run it: the coach who invites is that coach, and a manager names
   * one. Nothing comes before it (TRIAL.md §1.2), and no recommendation is
   * needed: an academy does not need a scout's permission to look at a player. When the invitation does answer a recommendation (the
   * inbox), its id rides along so the scout behind it is settled by the verdict.
   *
   * ## What it writes
   *
   * The trial (PRIVATE, for the player's gender, never listed), the coach
   * assignment, and one application already at INVITED — it is the player's
   * answer that is awaited now (`respondToInvitation`). The backing
   * recommendations are snapshotted so the verdict can settle them (§28).
   */
  async invitePlayer(userId: string, playerId: string, dto: InvitePlayerDto) {
    const inviter = await this.inviterFor(userId);
    const { academyId } = inviter;

    // Unreachable for a local team by construction, but stated: the rule must
    // survive somebody relaxing the membership check above.
    await this.assertIsAcademy(academyId, 'invite players to a private trial');

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
     * One of ours already. A trial is how an academy decides whether to take a
     * player on; a player on its books has been decided. Refused here, not
     * only hidden on the profile: the inbox row and a direct request reach
     * this too. RELEASED is "was here, is not now" and may be invited back.
     */
    const member = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId: player.userId } },
      select: { status: true },
    });
    if (member && member.status !== 'RELEASED') {
      throw new ConflictException('This player is from your academy');
    }

    /*
     * The private trial is created for this one player, so it is for their
     * gender — not the column's default. The same rule that refuses a
     * mismatched applicant on the open board is asserted here, before anything
     * is written, so an invitation can never be the way round it.
     */
    const trialGender = player.gender;
    assertGenderEligible({ gender: trialGender }, player);

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('That is not a date');

    /*
     * Who will run it, and therefore who may write the verdict (§10).
     * A coach who invites is the coach: asking them to pick themselves from a
     * list would be a step with one answer. A manager names one, because a
     * private trial is about one player and the manager usually knows whose
     * eye they want on them.
     */
    const coachUserId =
      inviter.role === 'COACH' ? userId : await this.assertAcademyCoach(academyId, dto.coachUserId);

    /*
     * One open invitation per player per academy.
     * A second is a contradiction rather than a reminder, and the screens that
     * offer this button already ask `academyStateFor` so they need not press it.
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
     * The recommendation this invitation answers, when it answers one.
     * Only one addressed to this academy about this player counts — anything
     * else is somebody's id pasted into a request, and the verdict must not
     * settle a scout who never put this player forward here.
     */
    const recommendationId = dto.recommendationId
      ? ((
          await this.prisma.recommendationTarget.findFirst({
            where: {
              academyId,
              recommendationId: dto.recommendationId,
              recommendation: { playerId },
            },
            select: { recommendationId: true },
          })
        )?.recommendationId ?? null)
      : null;

    const note = sanitizeRichText(dto.note ?? '');
    const plainNote = richTextToPlain(note) || (dto.note ?? '').trim();

    const application = await this.prisma.$transaction(async (tx) => {
      const trial = await tx.trial.create({
        data: {
          academyId,
          type: 'PRIVATE',
          gender: trialGender,
          title: `Private trial — ${player.firstName} ${player.lastName}`,
          location: dto.location.trim(),
          date,
          startTime: dto.startTime ?? null,
          // No deadline and no range: this is an invitation, not an announcement.
          applyDeadline: null,
          ageRangeMin: null,
          ageRangeMax: null,
          positions: [],
          requirements: dto.requirements?.trim() || null,
          note,
          coaches: { create: { coachUserId } },
        },
      });

      return tx.trialApplication.create({
        data: {
          trialId: trial.id,
          playerId,
          // Straight to INVITED: it is the player's answer that is awaited now.
          status: 'INVITED',
          inviteNote: plainNote,
          recommendationId,
        },
        include: { trial: true },
      });
    });

    // Every scout who put this player forward is riding on the trial's answer.
    await this.backings.snapshotBackings(application.id, playerId, academyId);

    await this.notifications.notify(
      player.userId,
      'TRIAL_INVITATION',
      {
        applicationId: application.id,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        academyId,
        academyName: inviter.academyName,
        status: 'INVITED',
        note: plainNote,
      },
      { userId, role: inviter.role === 'MANAGER' ? 'academy_manager' : 'coach' },
    );

    return application;
  }

  /**
   * The academy the caller may invite for, and as what.
   *
   * A manager's ACTIVE membership, or — failing that — a coach's ACTIVE
   * membership *and* ACTIVE endorsement, the same two rows that make a coach
   * credible anywhere else on the platform. Manager first: somebody who is
   * both invites as the manager and names the coach.
   */
  private async inviterFor(
    userId: string,
  ): Promise<{ academyId: string; academyName: string; role: 'MANAGER' | 'COACH' }> {
    const manager = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true, academy: { select: { name: true } } },
    });
    if (manager) {
      return { academyId: manager.academyId, academyName: manager.academy.name, role: 'MANAGER' };
    }

    const coach = await this.prisma.academyMember.findFirst({
      where: {
        userId,
        role: 'COACH',
        status: 'ACTIVE',
        academy: { endorsements: { some: { userId, role: 'COACH', status: 'ACTIVE' } } },
      },
      select: { academyId: true, academy: { select: { name: true } } },
    });
    if (coach) {
      return { academyId: coach.academyId, academyName: coach.academy.name, role: 'COACH' };
    }

    throw new ForbiddenException('Only an academy manager or coach can invite a player to a trial');
  }

  /** The coach a manager named — one the academy has endorsed, and still does. */
  private async assertAcademyCoach(academyId: string, coachUserId: string | undefined) {
    if (!coachUserId) throw new BadRequestException('Choose the coach who will run the trial');
    const endorsed = await this.prisma.academyEndorsement.findFirst({
      where: { academyId, userId: coachUserId, role: 'COACH', status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!endorsed) throw new BadRequestException('That coach does not work for this academy');
    return coachUserId;
  }

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
      where: { academyId, status: 'PENDING' },
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

    /*
     * Who has already been invited, so the row stops offering the button.
     *
     * An invited player does not leave the inbox when the invitation goes out —
     * the recommendation is not settled until the trial answers it (§28), so the
     * target row is still PENDING. Without this the manager would be offered
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
     * (§28), so the target row is still PENDING and cannot be filtered on. But
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
        const invitation = invitationOf.get(item.playerId);
        return {
          ...item,
          invitation: invitation
            ? {
                applicationId: invitation.id,
                status: invitation.status,
                trialId: invitation.trial.id,
                date: invitation.trial.date,
              }
            : null,
        };
      });

    return { items: rows, total: rows.length };
  }

  /**
   * How many players are waiting in the inbox for the manager's move.
   *
   * Drives the badge on the Inbox entry. Counted the way `listRankedForAcademy`
   * builds its list — distinct players with a pending target for this academy
   * who have not been invited to a private trial — so the badge and the screen
   * behind it cannot disagree. The academy is resolved from the caller: the
   * header drawing this badge knows who is signed in and nothing else.
   */
  async inboxCount(userId: string) {
    const managed = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER', status: 'ACTIVE' },
      select: { academyId: true },
    });
    if (!managed) return { count: 0, academyId: null };

    const targets = await this.prisma.recommendationTarget.findMany({
      where: { academyId: managed.academyId, status: 'PENDING' },
      select: { recommendation: { select: { playerId: true } } },
    });
    const playerIds = [...new Set(targets.map((target) => target.recommendation.playerId))];
    const invited = await this.invitedPlayerIds(managed.academyId, playerIds);

    return {
      count: playerIds.filter((playerId) => !invited.has(playerId)).length,
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
     * PENDING for weeks. Filtering on status alone lost them from both lists:
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
   * Settle every scout riding on a trial — TRIAL.md Rules 12–15.
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
   * A coach's job is to judge the player's football on the pitch and nothing
   * else (§1.9, TRIAL.md Rule 2). Letting them open the profile of the scout
   * who filed the recommendation puts a Legendary badge beside the player, and
   * a coach who knows a Level 6 scout is vouching is no longer answering the
   * same question — the verdict starts measuring the scout's reputation instead
   * of the player's football. That is exactly the pressure this refusal
   * removes, and it is why the rule is a refusal rather than a hidden link: a
   * coach who reaches the URL directly must be told no too.
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
          targets: { some: { status: 'PENDING' } },
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
        'A coach judges the player, not the scout who put them forward. Scout profiles are not shown here.',
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
   * §23 asks for a *recalculation* after each finalized outcome and there are
   * four places one can happen — the inbox turning a player down, a trial PASS,
   * a trial FAIL, and filing a new recommendation. Four deltas that must each be
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

  /** Refuses the trial pipeline to a local team. See academy-kind.util. */
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
