import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AssignCoachesDto,
  CreateTrialDto,
  InviteToTrialDto,
  RecordTrialVerdictDto,
  UpdateTrialApplicationStatusDto,
  UpdateTrialDto,
} from './dto/trial.dto';
import { ProcessAService } from '../recommendations/process-a.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { InvitationsService } from '../academies/invitations.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { ageAt, birthDateForAge } from '../common/age.util';
import { sanitizeRichText } from '../common/rich-text.util';
import { assertNotLocalTeam } from '../academies/academy-kind.util';

@Injectable()
export class TrialsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private processA: ProcessAService,
    private invitations: InvitationsService,
    private recommendations: RecommendationsService,
    private redis: RedisService,
  ) {}

  async create(userId: string, academyId: string, dto: CreateTrialDto) {
    await this.assertAcademyManager(userId, academyId);

    /*
     * A local team does not hold trials.
     *
     * Refused at creation and nowhere else, deliberately: applying, accepting,
     * rejecting and the coach's pass/fail all hang off a trial row, so a kind
     * that can never own one cannot reach any of them. Guarding each of those
     * separately would be five checks defending a door that has no room behind
     * it — and five places for the rule to drift.
     */
    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { kind: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');
    assertNotLocalTeam(academy.kind, 'hold trials');

    const date = new Date(dto.date);
    const applyDeadline = new Date(dto.applyDeadline);
    if (applyDeadline > date) {
      throw new BadRequestException('Applications cannot close after the trial has happened');
    }

    const trial = await this.prisma.trial.create({
      // Sanitised here rather than trusted from the client: the editor cleans as
      // a convenience for the person typing, but this endpoint is reachable
      // without it.
      data: { academyId, ...dto, date, applyDeadline, note: sanitizeRichText(dto.note) },
    });

    await this.announceToMatchingPlayers(trial, userId);
    return trial;
  }

  /**
   * Tells the players a new trial is actually for.
   *
   * ## Matched, not broadcast
   *
   * A notification that does not apply to you is how somebody learns to ignore
   * the ones that do. So this reaches only players whose **primary or secondary
   * position** is one the academy asked for and whose **age on the day of the
   * trial** falls inside the stated range — the same two fields the manager
   * filled in, which makes the message true by construction rather than by a
   * ranking anybody has to trust.
   *
   * Age is computed against the trial date rather than today, because that is
   * the rule `apply` enforces: a boy who turns 14 the week before a U14 morning
   * is eligible, and telling him about it and then refusing his application
   * would be worse than staying quiet.
   *
   * ## Private trials say nothing
   *
   * A private trial is a session for one named child (TRIAL.md §18) and carries
   * no positions or age range at all. Announcing one would tell a stranger that
   * child is being looked at.
   */
  private async announceToMatchingPlayers(
    trial: {
      id: string;
      academyId: string;
      title: string;
      date: Date;
      type: string;
      positions: string[];
      ageRangeMin: number | null;
      ageRangeMax: number | null;
    },
    actorUserId: string,
  ) {
    if (trial.type !== 'GENERAL' || trial.positions.length === 0) return;

    /*
     * Age is filtered as a birth-date window, in the query.
     *
     * The alternative — read every player and compute ages in memory — is a full
     * table scan of a table that grows with every signup, run inside the request
     * that creates a trial. Ages become dates once, here, and the database uses
     * its index on the column.
     */
    const bounds: { gt?: Date; lte?: Date } = {};
    /*
     * Oldest allowed, and the boundary is **exclusive**.
     *
     * `birthDateForAge(date, max + 1)` is the day somebody turns `max + 1` on the
     * trial date — already a year too old. `gte` therefore let them through: a
     * trial for 16–18-year-olds notified a player born exactly nineteen years
     * before it, because the bound included its own edge. Caught by seeding a
     * player at exactly max + 1 and watching them get the notification.
     *
     * `gt` excludes that day and keeps every day after it, which is the rule the
     * range states. The lower bound below stays `lte` for the mirror reason:
     * somebody turning `min` *on* the trial date is old enough, and inclusive is
     * what makes that true.
     */
    if (trial.ageRangeMax != null) bounds.gt = birthDateForAge(trial.date, trial.ageRangeMax + 1);
    // Youngest allowed: born no later than (trial date − minAge).
    if (trial.ageRangeMin != null) bounds.lte = birthDateForAge(trial.date, trial.ageRangeMin);

    const matches = await this.prisma.playerProfile.findMany({
      where: {
        OR: [
          { primaryPosition: { in: trial.positions } },
          { secondaryPosition: { in: trial.positions } },
        ],
        ...(bounds.gt || bounds.lte ? { birthDate: bounds } : {}),
        user: {
          // A private account has asked not to be found; an unannounced trial is
          // part of what that buys.
          isPrivate: false,
          isActive: true,
          /*
           * And they must have asked to hear from *this* academy.
           *
           * Position and age already made the message true, but true is not the
           * same as wanted: a fifteen-year-old goalkeeper matches every U16
           * goalkeeping trial in the country, and a product that texts them all
           * of them is a product they mute. Following an academy is the player
           * saying which ones they want.
           *
           * Reuses the existing `Follow` row — `targetType: ACADEMY` already
           * means exactly this, and its `@@unique([followerId, targetType,
           * targetId])` already makes a duplicate follow impossible. A second
           * table for the same statement would need its own uniqueness, its own
           * cleanup on account deletion, and a rule for what it means when the
           * two disagree.
           */
          follows: { some: { targetType: 'ACADEMY', targetId: trial.academyId } },
        },
      },
      select: { userId: true },
    });

    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: trial.academyId },
      select: { name: true },
    });

    for (const match of matches) {
      await this.notifications.notify(
        match.userId,
        'TRIAL_PUBLISHED',
        {
          trialId: trial.id,
          trialTitle: trial.title,
          academyId: trial.academyId,
          academyName: academy?.name ?? null,
          date: trial.date,
          positions: trial.positions,
        },
        { userId: actorUserId, role: 'academy_manager' },
      );
    }
  }

  /**
   * How far the trials list has moved since this account last looked.
   *
   * Drives the badge on the Trials menu entry. Counted per role, because "a
   * trial worth knowing about" is a different set for each: a player is offered
   * open general trials they could apply to, while academy staff are told about
   * their own academy's new ones and nobody else's.
   */
  async unseenCount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trialsSeenAt: true },
    });
    // Null means never opened — everything currently open is new to them.
    const since = user?.trialsSeenAt ?? undefined;
    const now = new Date();

    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, role: { in: ['MANAGER', 'COACH'] }, status: 'ACTIVE' },
      select: { academyId: true },
    });

    // Staff see their own academy's; everybody else sees the public list. A
    // coach who is also a player gets the staff answer, matching the menu they
    // are looking at.
    const where = membership
      ? { academyId: membership.academyId, status: 'OPEN' as const }
      : {
          status: 'OPEN' as const,
          type: 'GENERAL' as const,
          date: { gte: now },
          // Only ones they could still act on: a closed deadline is not news.
          OR: [{ applyDeadline: null }, { applyDeadline: { gte: now } }],
        };

    const count = await this.prisma.trial.count({
      where: { ...where, ...(since ? { createdAt: { gt: since } } : {}) },
    });

    return { count, since: since ?? null };
  }

  /** Clears the badge. Called when the trials list is opened. */
  async markSeen(userId: string) {
    const seenAt = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { trialsSeenAt: seenAt } });
    return { seenAt };
  }

  /**
   * The academy's live trials — the two lists a manager works from.
   *
   * Archived ones are deliberately not here: a trial is archived when every
   * applicant has a verdict, so it is finished work rather than a thing to do,
   * and leaving it in the working lists meant they only ever grew. It moves to
   * `listArchivedForAcademy`, which is paginated because that list never stops
   * growing either.
   */
  async listForAcademy(academyId: string) {
    return this.prisma.trial.findMany({
      where: { academyId, status: 'OPEN' },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * The history: everything this academy has finished, newest first.
   *
   * Paginated rather than capped, because "show me the U14 morning from two
   * springs ago" is exactly what a history is for, and a hard limit would make
   * the oldest records unreachable — including the applications attached to
   * them, which are decisions somebody made about a child.
   */
  async listArchivedForAcademy(userId: string, academyId: string, page = 1, pageSize = 10) {
    await this.assertAcademyManager(userId, academyId);

    const where = { academyId, status: 'ARCHIVED' as const };
    const [items, total] = await Promise.all([
      this.prisma.trial.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.trial.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * The trials this coach is working, each with the size of the job.
   *
   * A coach's whole relationship with a trial runs through being assigned to it:
   * it is what lets them read a private one, see the sheet, and record a verdict.
   * So it is also the right list to open — "every trial my academy is running"
   * would put them in front of sessions they have no part in, including private
   * ones about children they were never asked to look at.
   *
   * The two counts are what turns a list of dates into a work queue.
   * `awaitingVerdict` is the number the screen sorts and badges on: a trial with
   * nobody left to answer for is finished, however recent it is, and one with
   * eleven outstanding is today's work even if the date has passed. Counted here
   * rather than per row on the client, which would be a request per trial on the
   * first screen a coach opens.
   */
  async listForCoach(userId: string) {
    const rows = await this.prisma.trialCoach.findMany({
      where: { coachUserId: userId },
      include: { trial: true },
      orderBy: { trial: { date: 'asc' } },
    });
    if (rows.length === 0) return [];

    const trialIds = rows.map((row) => row.trialId);
    // Two independent counts, so `Promise.all` rather than `$transaction`: there
    // is no invariant between them to protect, and the array form of
    // `$transaction` loses Prisma's `groupBy` result typing.
    const [applicants, awaiting] = await Promise.all([
      this.prisma.trialApplication.groupBy({
        by: ['trialId'],
        where: { trialId: { in: trialIds } },
        _count: { _all: true },
      }),
      // APPLIED and CONFIRMED are exactly the states a verdict can be written
      // from — recording one moves the row to PASSED or FAILED, so "still in one
      // of these" and "still waiting on me" are the same set.
      this.prisma.trialApplication.groupBy({
        by: ['trialId'],
        where: { trialId: { in: trialIds }, status: { in: ['APPLIED', 'CONFIRMED'] } },
        _count: { _all: true },
      }),
    ]);

    const applicantOf = new Map(applicants.map((row) => [row.trialId, row._count._all]));
    const awaitingOf = new Map(awaiting.map((row) => [row.trialId, row._count._all]));

    return rows.map((row) => ({
      ...row.trial,
      applicantCount: applicantOf.get(row.trialId) ?? 0,
      awaitingVerdict: awaitingOf.get(row.trialId) ?? 0,
    }));
  }

  /**
   * The public board.
   *
   * General trials only. A private trial is a session for one named child; it
   * reaches that child through an invitation, and listing it here would make the
   * academy's interest public before the family had answered.
   */
  async listUpcoming() {
    return this.prisma.trial.findMany({
      where: { date: { gte: new Date() }, status: 'OPEN', type: 'GENERAL' },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * One trial, if the caller is allowed to know it exists.
   *
   * A general trial is public. A private one is readable by the academy that
   * runs it, the coaches working it, and the player it concerns — and a 404 for
   * everyone else, because "403 Forbidden" on a trial for one named child still
   * tells the reader that child is being looked at.
   */
  async getVisibleById(trialId: string, userId?: string) {
    const trial = await this.getById(trialId);
    if (trial.type === 'GENERAL') return trial;
    if (!userId) throw new NotFoundException('Trial not found');

    /*
     * A coach reaches a private trial by being assigned to it, not by working
     * for the academy.
     *
     * `role: { in: ['MANAGER', 'COACH'] }` here let every coach on the staff
     * read every private trial — which is what TrialCoach's own note calls out
     * as the thing to avoid: it makes the private ones public within the
     * building. A session about one named child is for the people running it.
     */
    const [staff, coach, application] = await Promise.all([
      this.prisma.academyMember.findFirst({
        where: { userId, academyId: trial.academyId, role: 'MANAGER' },
        select: { id: true },
      }),
      this.prisma.trialCoach.findFirst({ where: { trialId, coachUserId: userId } }),
      this.prisma.trialApplication.findFirst({
        where: { trialId, player: { userId } },
        select: { id: true },
      }),
    ]);
    if (!staff && !coach && !application) throw new NotFoundException('Trial not found');
    return trial;
  }

  /**
   * Name the coaches working this trial.
   *
   * They must already work for the academy: a coach's standing here is the
   * academy's endorsement of them (§1.5.3), and assigning an outsider would let
   * a trial manufacture the credential the platform is supposed to check.
   */
  async assignCoaches(userId: string, trialId: string, coachUserIds: string[]) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);

    const endorsed = await this.prisma.academyEndorsement.findMany({
      where: {
        academyId: trial.academyId,
        role: 'COACH',
        status: 'ACTIVE',
        userId: { in: coachUserIds },
      },
      select: { userId: true },
    });
    if (endorsed.length !== coachUserIds.length) {
      throw new BadRequestException('One of those coaches does not work for this academy');
    }

    await this.prisma.$transaction([
      this.prisma.trialCoach.deleteMany({ where: { trialId } }),
      this.prisma.trialCoach.createMany({
        data: coachUserIds.map((coachUserId) => ({ trialId, coachUserId })),
      }),
    ]);

    return this.listCoaches(trialId);
  }

  async listCoaches(trialId: string) {
    const rows = await this.prisma.trialCoach.findMany({
      where: { trialId },
      include: {
        coachUser: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });
    return rows.map((row) => row.coachUser);
  }

  /**
   * The invitation to a private trial, once a coach has approved the profile.
   *
   * Only after Process A returned TRUE: inviting on a manager's hunch is the
   * shortcut this flow exists to remove. The note is required because "you are
   * invited" with no word about where or when is not something a family can act
   * on.
   */
  async invite(userId: string, applicationId: string, dto: InviteToTrialDto) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: { select: { userId: true } } },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    await this.assertAcademyManager(userId, application.trial.academyId);

    if (application.status !== 'SHORTLISTED') {
      throw new BadRequestException('A coach has to approve this player first');
    }

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: 'INVITED', inviteNote: dto.note.trim() },
    });

    await this.notifications.notify(
      application.player.userId,
      'TRIAL_INVITATION',
      {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        status: 'INVITED',
        note: dto.note.trim(),
      },
      { userId, role: 'academy_manager' },
    );

    return updated;
  }

  /**
   * The player's answer — the only step nobody else can take for them.
   *
   * A yes is what puts them on the sheet for the day; a no closes the
   * application rather than leaving the academy waiting on somebody who has
   * already decided.
   */
  async respondToInvitation(userId: string, applicationId: string, accept: boolean) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { player: { select: { userId: true } }, trial: true },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    if (application.player.userId !== userId) {
      throw new ForbiddenException('That invitation was not addressed to you');
    }
    if (application.status !== 'INVITED') {
      throw new BadRequestException('You have already answered this invitation');
    }

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: accept ? 'CONFIRMED' : 'REJECTED' },
    });

    /*
     * A yes ends the online half of this entirely.
     *
     * It used to re-run Process A here, which reopened the same review row to
     * PENDING so a coach could "decide" it a second time — the profile screening
     * and the verdict on the day were one record, overwriting each other.
     * TRIAL.md Rule 19 forbids exactly that. What follows a confirmation is not
     * another review; it is the trial, and its verdict is `recordVerdict`.
     */

    const manager = await this.prisma.academyMember.findFirst({
      where: { academyId: application.trial.academyId, role: 'MANAGER' },
      select: { userId: true },
    });
    if (manager) {
      await this.notifications.notify(
        manager.userId,
        'TRIAL_RESULT',
        {
          applicationId,
          trialId: application.trialId,
          trialTitle: application.trial.title,
          status: updated.status,
        },
        { userId, role: 'player' },
      );
    }

    return updated;
  }

  /**
   * The coach's verdict, after testing the player in person — TRIAL.md Rules 4, 7.
   *
   * The one place PASS and FAIL are written, and the only thing that can reach a
   * squad (Rule 8). It is deliberately not a second decision on the online
   * review: that answered "is this player worth looking at", this answers "did
   * they pass the football examination", and §36 requires the two to stay apart.
   *
   * ## What a verdict settles
   *
   * Both outcomes move every backing scout's reputation, because both are
   * finalized outcomes (§28) and a player rarely arrives on one scout's word.
   * Only a PASS clears the player's recommendations (Rule 13) — a FAIL is an
   * answer about one morning, not a reason to wipe the record of who spotted
   * them.
   *
   * Neither outcome places anybody. That is `addToSquad`, and it is the
   * manager's (Rule 9).
   */
  async recordVerdict(userId: string, applicationId: string, dto: RecordTrialVerdictDto) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: {
        trial: true,
        player: { select: { id: true, userId: true, firstName: true, lastName: true } },
        result: { select: { id: true } },
      },
    });
    if (!application) throw new NotFoundException('Trial application not found');

    /*
     * Only a coach working this trial.
     *
     * Not "any coach the academy endorses": a club runs its U14 morning and its
     * goalkeeper session with different staff, and a verdict is a statement that
     * the person writing it was there. The manager cannot write one at all —
     * Rule 16 is that the academy does not evaluate the football.
     */
    const assigned = await this.prisma.trialCoach.findUnique({
      where: { trialId_coachUserId: { trialId: application.trialId, coachUserId: userId } },
    });
    if (!assigned) {
      throw new ForbiddenException('Only a coach working this trial can record a verdict');
    }
    const coachProfile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!coachProfile) throw new BadRequestException('That coach has no coach profile');

    // A trial answers once. A second look is a second trial, with its own
    // application and its own verdict.
    if (application.result) {
      throw new BadRequestException('This player has already been given a verdict');
    }

    /*
     * Only somebody who was expected on the day.
     *
     * `APPLIED` is the general route — the player put themselves forward and
     * turned up. `CONFIRMED` is the private one — screened, invited, and they
     * said yes. Anything else means the player was never on the sheet: an
     * invitation nobody answered, or an application already closed.
     */
    if (application.status !== 'APPLIED' && application.status !== 'CONFIRMED') {
      throw new BadRequestException('Only a player expected at this trial can be given a verdict');
    }

    /*
     * No attributes here. TRIAL.md Rule 22.
     *
     * A coach at the side of a pitch answers one question — did they pass — and
     * eight sliders between them and that answer is how verdicts stop being
     * recorded on the day. It is also a judgement they are not yet in a position
     * to make: one morning is enough to say PASS, not enough to fill in eight
     * attributes as though they had coached the player for a season. Those come
     * later, once the manager places the player in a group and somebody becomes
     * responsible for coaching them (Rule 21, README §1.9).
     */
    const result = await this.prisma.$transaction(async (tx) => {
      const written = await tx.trialResult.create({
        data: {
          applicationId,
          coachUserId: userId,
          coachProfileId: coachProfile.id,
          verdict: dto.verdict,
          note: dto.note ?? null,
        },
      });

      await tx.trialApplication.update({
        where: { id: applicationId },
        data: { status: dto.verdict === 'PASS' ? 'PASSED' : 'FAILED' },
      });

      return written;
    });

    /*
     * The scouts, in the order §28 sets out: clear first, then recalculate.
     *
     * Clearing does not touch the target rows the success rate is counted from,
     * so the order is not load-bearing for correctness — but the rule is written
     * that way, and a reader checking this against §28 should find it in the same
     * sequence rather than having to work out that it does not matter.
     */
    const backings = await this.processA.backingsOf(applicationId, application.recommendationId);

    if (dto.verdict === 'PASS') {
      await this.recommendations.clearPlayerRecommendations(application.playerId);
    }
    await this.recommendations.settleTrialBackings({
      recommendationIds: backings,
      academyId: application.trial.academyId,
      status: dto.verdict === 'PASS' ? 'ACCEPTED' : 'REJECTED',
      actor: { userId, role: 'coach' },
    });

    await this.notifications.notify(
      application.player.userId,
      'TRIAL_RESULT',
      {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        status: dto.verdict === 'PASS' ? 'PASSED' : 'FAILED',
        verdict: dto.verdict,
        note: dto.note ?? null,
      },
      { userId, role: 'coach' },
    );

    /*
     * The manager hears about a pass, and only a pass.
     *
     * A PASS is the one verdict that asks something of them — the player is now
     * eligible for a squad place and nobody else can give it. A FAIL asks
     * nothing: it is the coach's judgement, complete on its own, and forwarding
     * every one of them would bury the handful that need an answer under a
     * running commentary on a morning the manager did not attend.
     *
     * The whole sheet is still on the trial's own screen either way.
     */
    if (dto.verdict === 'PASS') {
      const manager = await this.prisma.academyMember.findFirst({
        where: { academyId: application.trial.academyId, role: 'MANAGER' },
        select: { userId: true },
      });
      if (manager) {
        await this.notifications.notify(
          manager.userId,
          'TRIAL_RESULT',
          {
            applicationId,
            trialId: application.trialId,
            trialTitle: application.trial.title,
            playerId: application.playerId,
            playerName: `${application.player.firstName} ${application.player.lastName}`,
            status: 'PASSED',
            verdict: 'PASS',
          },
          { userId, role: 'coach' },
        );
      }
    }

    await this.archiveIfSettled(application.trialId);

    // The player's cached profile now has a new assessment on it.
    await this.redis.del(RedisKeys.playerProfile(application.playerId));

    return result;
  }

  /**
   * Close a trial once nobody is left to answer for.
   *
   * A trial's work is finished when every applicant has a verdict, and at that
   * point leaving it OPEN means it sits in the manager's working lists for ever
   * and stays on the public board collecting applications for a session that has
   * already happened. Archiving moves it to the history, where the applications
   * — decisions somebody made about a child — are kept rather than deleted.
   *
   * Outstanding is every state a player can still be tested from — including
   * the ones on the way there, so a private trial whose invitation was never
   * answered stays open rather than closing itself behind the family. A
   * REJECTED application is settled even though it has no verdict: nobody is
   * going to test that player, and waiting for one would hold the trial open
   * for ever.
   *
   * A trial nobody applied to is left alone. "Zero outstanding" is true of an
   * empty trial from the moment it is published, and archiving on that would
   * close trials that never opened.
   */
  private async archiveIfSettled(trialId: string) {
    const [outstanding, total] = await Promise.all([
      this.prisma.trialApplication.count({
        where: {
          trialId,
          status: { in: ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INVITED', 'CONFIRMED'] },
        },
      }),
      this.prisma.trialApplication.count({ where: { trialId } }),
    ]);
    if (outstanding > 0 || total === 0) return;

    await this.prisma.trial.updateMany({
      where: { id: trialId, status: 'OPEN' },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * The end of the road: the academy takes the player on.
   *
   * It sends an invitation to join rather than writing the membership directly.
   * A trial is strong evidence of mutual interest, but joining an academy is
   * still the player's yes to give — the same rule every other route into a
   * squad follows, and the same screen the player already answers it on.
   *
   * The gate is a trial PASS and nothing else (Rule 8). It used to be an online
   * review's APPROVED, which is a judgement about clips and numbers — §11 says
   * in as many words that it is not a pass, and on a general trial there is no
   * online review to consult at all.
   *
   * The scouts are already settled by then: their call was answered by the coach
   * on the day, not by this administrative step (§28).
   */
  async addToSquad(userId: string, applicationId: string) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: { select: { userId: true } } },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    await this.assertAcademyManager(userId, application.trial.academyId);

    if (application.status !== 'PASSED') {
      throw new BadRequestException('A coach has to pass this player at the trial first');
    }

    const invitation = await this.invitations.invite(userId, application.trial.academyId, {
      userId: application.player.userId,
      role: 'PLAYER',
      note: `${application.trial.title} — ${application.trial.location}`,
    });

    await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: 'ACCEPTED' },
    });

    /*
     * The news, separate from the paperwork.
     *
     * `invitations.invite` already notifies — with an academy join invitation
     * awaiting a yes. That is a form. A fourteen-year-old who trained for this,
     * turned up and passed should also be told plainly that they passed and the
     * academy wants them, in words that are about them rather than about a
     * membership record.
     */
    await this.notifications.notify(
      application.player.userId,
      'SQUAD_PLACEMENT',
      {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        academyId: application.trial.academyId,
      },
      { userId, role: 'academy_manager' },
    );

    return invitation;
  }

  /**
   * Change a published trial, or close it.
   *
   * There is no delete. Every application attached to a trial is a decision
   * somebody made about a child, and a row that vanishes takes that record with
   * it — so a trial that will not happen is ARCHIVED, which stops applications
   * and hides it from the public list while the academy keeps the history.
   */
  async update(userId: string, trialId: string, dto: UpdateTrialDto) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);

    const ageRangeMin = dto.ageRangeMin ?? trial.ageRangeMin;
    const ageRangeMax = dto.ageRangeMax ?? trial.ageRangeMax;
    // Both null on a private trial, which has no eligibility rules to order.
    if (ageRangeMin != null && ageRangeMax != null && ageRangeMin > ageRangeMax) {
      throw new BadRequestException('The minimum age cannot be above the maximum');
    }

    const date = dto.date !== undefined ? new Date(dto.date) : trial.date;
    const applyDeadline =
      dto.applyDeadline !== undefined ? new Date(dto.applyDeadline) : trial.applyDeadline;
    if (applyDeadline && applyDeadline > date) {
      throw new BadRequestException('Applications cannot close after the trial has happened');
    }

    // Compared before the write, because afterwards there is nothing to compare
    // against — the old date is gone.
    const moved = dto.date !== undefined && date.getTime() !== trial.date.getTime();

    const updated = await this.prisma.trial.update({
      where: { id: trialId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.date !== undefined ? { date } : {}),
        ...(dto.applyDeadline !== undefined ? { applyDeadline } : {}),
        ...(dto.ageRangeMin !== undefined ? { ageRangeMin: dto.ageRangeMin } : {}),
        ...(dto.ageRangeMax !== undefined ? { ageRangeMax: dto.ageRangeMax } : {}),
        ...(dto.positions !== undefined ? { positions: dto.positions } : {}),
        ...(dto.requirements !== undefined
          ? { requirements: dto.requirements.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: sanitizeRichText(dto.note) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    if (moved)
      await this.announceReschedule(updated, trial.date, { userId, role: 'academy_manager' });

    return updated;
  }

  /**
   * Tell everybody holding an application that the exam moved.
   *
   * The date is the one detail of a trial a family arranges their week around,
   * so changing it quietly is the single edit that can waste somebody's morning.
   * Both dates go in the payload: "it moved" without saying from what leaves the
   * reader checking whether they had remembered it wrong.
   *
   * Everyone still in play, which excludes the rejected and those already given
   * a verdict — their trial is over and the new date is not about them.
   */
  private async announceReschedule(
    trial: { id: string; title: string; date: Date },
    was: Date,
    actor: { userId: string; role: string },
  ) {
    const applications = await this.prisma.trialApplication.findMany({
      where: {
        trialId: trial.id,
        status: { in: ['APPLIED', 'SCREENING', 'SHORTLISTED', 'INVITED', 'CONFIRMED'] },
      },
      select: { id: true, player: { select: { userId: true } } },
    });

    for (const application of applications) {
      await this.notifications.notify(
        application.player.userId,
        'TRIAL_RESCHEDULED',
        {
          applicationId: application.id,
          trialId: trial.id,
          trialTitle: trial.title,
          date: trial.date.toISOString(),
          previousDate: was.toISOString(),
        },
        actor,
      );
    }
  }

  async getById(trialId: string) {
    const trial = await this.prisma.trial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException('Trial not found');
    return trial;
  }

  /**
   * A player applies to a general trial, and that is the whole of it.
   *
   * No online coach review — TRIAL.md Rule 5. A general trial is the open day:
   * the academy announced it, the player put themselves forward, and the next
   * thing that happens is a coach watching them play. Screening the profile first
   * would make the open day something a player could be turned away from without
   * anyone seeing them kick a ball, which is the opposite of what it is for.
   *
   * The backings are still snapshotted, because the trial's verdict is what
   * settles every scout who put this player forward (§28).
   */
  async apply(userId: string, trialId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players can apply to trials');

    const trial = await this.getById(trialId);
    if (trial.status === 'ARCHIVED') {
      throw new BadRequestException('This trial is closed to new applications');
    }
    if (trial.type === 'PRIVATE') {
      throw new BadRequestException('This trial is by invitation only');
    }

    /*
     * Past the deadline the trial is readable but not applicable.
     *
     * Not hidden: a player who hears about it the day after should be able to
     * see what they missed and when the next one is, rather than meet a 404 that
     * tells them nothing. The button is simply gone.
     */
    if (trial.applyDeadline && trial.applyDeadline < new Date()) {
      throw new BadRequestException('Applications for this trial have closed');
    }

    /*
     * Only a trial that states a range can turn somebody away on age. A private
     * trial states none — nobody applies to one, so there is nothing to check.
     */
    const age = ageAt(player.birthDate, trial.date);
    if (
      trial.ageRangeMin != null &&
      trial.ageRangeMax != null &&
      (age < trial.ageRangeMin || age > trial.ageRangeMax)
    ) {
      throw new BadRequestException(
        `Player age (${age}) is outside the trial's age range (${trial.ageRangeMin}-${trial.ageRangeMax})`,
      );
    }

    const application = await this.prisma.trialApplication.upsert({
      where: { trialId_playerId: { trialId, playerId: player.id } },
      update: {},
      create: { trialId, playerId: player.id },
    });

    await this.processA.snapshotBackings(application.id, player.id, trial.academyId);

    return application;
  }

  async listMyApplications(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!player) throw new ForbiddenException('Only players have trial applications');
    return this.prisma.trialApplication.findMany({
      where: { playerId: player.id },
      include: { trial: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Who is coming, and what has been decided about them.
   *
   * Readable by the manager *and* by the coaches working the trial — a coach who
   * cannot list the applicants has no way to reach the one they just watched.
   * That used to arrive through their review queue, which is gone from the
   * general route now that it is not screened online (Rule 5).
   *
   * Both the online review and the verdict come back on the row, because they
   * are different facts: "a coach screened the profile and said yes" and "a coach
   * tested them and passed them" are the two halves this flow spent a release
   * conflating.
   */
  async listApplicationsForTrial(userId: string, trialId: string) {
    const trial = await this.getById(trialId);

    const [membership, coaching] = await Promise.all([
      this.prisma.academyMember.findUnique({
        where: { academyId_userId: { academyId: trial.academyId, userId } },
      }),
      this.prisma.trialCoach.findUnique({
        where: { trialId_coachUserId: { trialId, coachUserId: userId } },
      }),
    ]);
    if (membership?.role !== 'MANAGER' && !coaching) {
      throw new ForbiddenException('Only this academy or a coach working this trial can see that');
    }

    return this.prisma.trialApplication.findMany({
      where: { trialId },
      include: {
        player: true,
        review: {
          select: {
            id: true,
            status: true,
            note: true,
            decidedAt: true,
            coachUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        result: {
          select: {
            id: true,
            verdict: true,
            note: true,
            decidedAt: true,
            coachUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The academy withdrawing its interest.
   *
   * The only status a manager may write directly. It used to accept SHORTLISTED,
   * INVITED and ACCEPTED too, which made every gate optional — see
   * `UpdateTrialApplicationStatusDto` for why each of those is a coach's call
   * and not a manager's.
   */
  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    dto: UpdateTrialApplicationStatusDto,
  ) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: true },
    });
    if (!application) throw new NotFoundException('Trial application not found');

    await this.assertAcademyManager(userId, application.trial.academyId);

    const updated = await this.prisma.trialApplication.update({
      where: { id: applicationId },
      data: { status: dto.status },
    });

    await this.notifications.notify(
      application.player.userId,
      'TRIAL_RESULT',
      { applicationId, trialId: application.trialId, status: dto.status },
      { userId, role: 'academy_manager' },
    );

    return updated;
  }

  private async assertAcademyManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can perform this action');
    }
    return membership;
  }
}
