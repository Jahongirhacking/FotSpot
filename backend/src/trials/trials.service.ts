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
  NominatePlayerDto,
  UpdateTrialApplicationStatusDto,
  UpdateTrialDto,
} from './dto/trial.dto';
import { ProcessAService } from '../recommendations/process-a.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { InvitationsService } from '../academies/invitations.service';

@Injectable()
export class TrialsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private processA: ProcessAService,
    private invitations: InvitationsService,
    private recommendations: RecommendationsService,
  ) {}

  async create(userId: string, academyId: string, dto: CreateTrialDto) {
    await this.assertAcademyManager(userId, academyId);
    return this.prisma.trial.create({
      data: { academyId, ...dto, date: new Date(dto.date) },
    });
  }

  /**
   * Everything this academy has run, archived included.
   *
   * The manager's own list is the one place an archived trial must still appear:
   * it is where they go to reopen one closed by mistake, and where the
   * applicants of a finished trial still live.
   */
  async listForAcademy(academyId: string) {
    return this.prisma.trial.findMany({ where: { academyId }, orderBy: { date: 'asc' } });
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

    const [staff, coach, application] = await Promise.all([
      this.prisma.academyMember.findFirst({
        where: { userId, academyId: trial.academyId, role: { in: ['MANAGER', 'COACH'] } },
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
   * The academy puts a player forward for a private trial.
   *
   * The mirror image of a general trial: there the player applies and screening
   * follows, here the academy chooses and screening comes first. Either way the
   * next thing that happens is a coach reading the profile — Process A, in
   * `manual` because the manager who picked one player usually knows whose eye
   * they want on them.
   */
  async nominate(userId: string, trialId: string, dto: NominatePlayerDto) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);
    if (trial.type !== 'PRIVATE') {
      throw new BadRequestException('Players apply to a general trial themselves');
    }
    if (trial.status === 'ARCHIVED') throw new BadRequestException('This trial is closed');

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: dto.playerId },
      select: { id: true, birthDate: true },
    });
    if (!player) throw new NotFoundException('Player not found');

    const age = this.ageFromBirthDate(player.birthDate, trial.date);
    if (age < trial.ageRangeMin || age > trial.ageRangeMax) {
      throw new BadRequestException(
        `Player age (${age}) is outside the trial's age range (${trial.ageRangeMin}-${trial.ageRangeMax})`,
      );
    }

    // If a scout put this player in front of the academy, the review records
    // which recommendation — so accepting later still moves that scout's
    // reputation, exactly as it does from the inbox.
    const target = await this.prisma.recommendationTarget.findFirst({
      where: { academyId: trial.academyId, recommendation: { playerId: dto.playerId } },
      orderBy: { createdAt: 'desc' },
      select: { recommendationId: true },
    });

    const application = await this.prisma.trialApplication.upsert({
      where: { trialId_playerId: { trialId, playerId: dto.playerId } },
      update: { status: 'SCREENING' },
      create: { trialId, playerId: dto.playerId, status: 'SCREENING' },
    });

    await this.processA.snapshotBackings(application.id, dto.playerId, trial.academyId);

    await this.processA.start({
      playerId: dto.playerId,
      academyId: trial.academyId,
      mode: 'manual',
      coachUserId: dto.coachUserId,
      trialApplicationId: application.id,
      recommendationId: target?.recommendationId ?? null,
    });

    return application;
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

    await this.notifications.notify(application.player.userId, 'TRIAL_INVITATION', {
      applicationId,
      trialId: application.trialId,
      trialTitle: application.trial.title,
      status: 'INVITED',
      note: dto.note.trim(),
    });

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
     * Saying yes puts the profile in front of the staff who will run the day.
     *
     * Process A again, in `auto`, and this time to *every* coach on the trial —
     * the first screening was about clips and numbers, this one is about a
     * player they will have watched. Same question, second time of asking.
     *
     * A failure here does not undo the player's answer: they have confirmed, and
     * an academy with nobody assigned to the trial simply has nothing to hand
     * the profile to yet.
     */
    if (accept) {
      try {
        const coaches = await this.prisma.trialCoach.findMany({
          where: { trialId: application.trialId },
          select: { coachUserId: true },
        });
        await this.processA.start({
          playerId: application.playerId,
          academyId: application.trial.academyId,
          mode: 'auto',
          coachPool: coaches.map((row) => row.coachUserId),
          trialApplicationId: applicationId,
          recommendationId: application.recommendationId,
        });
      } catch {
        // Nothing to assign to. The manager can send them for review by hand.
      }
    }

    const manager = await this.prisma.academyMember.findFirst({
      where: { academyId: application.trial.academyId, role: 'MANAGER' },
      select: { userId: true },
    });
    if (manager) {
      await this.notifications.notify(manager.userId, 'TRIAL_RESULT', {
        applicationId,
        trialId: application.trialId,
        trialTitle: application.trial.title,
        status: updated.status,
      });
    }

    return updated;
  }

  /**
   * The end of the road: the academy takes the player on.
   *
   * It sends an invitation to join rather than writing the membership directly.
   * A trial is strong evidence of mutual interest, but joining an academy is
   * still the player's yes to give — the same rule every other route into a
   * squad follows, and the same screen the player already answers it on.
   */
  async addToSquad(userId: string, applicationId: string) {
    const application = await this.prisma.trialApplication.findUnique({
      where: { id: applicationId },
      include: { trial: true, player: { select: { userId: true } } },
    });
    if (!application) throw new NotFoundException('Trial application not found');
    await this.assertAcademyManager(userId, application.trial.academyId);

    /*
     * The gate is a coach's yes, not a status name.
     *
     * A general trial's applicant is approved once; a private one is screened,
     * invited, seen on the day and approved again. Both end at the same place —
     * a coach on this academy said this player is worth a place — so that is
     * what is checked, rather than a list of statuses that would have to be kept
     * in step with two different routes.
     */
    const review = await this.prisma.recommendationReview.findUnique({
      where: {
        playerId_academyId: {
          playerId: application.playerId,
          academyId: application.trial.academyId,
        },
      },
      select: { status: true, recommendationId: true },
    });
    if (application.status === 'REJECTED' || review?.status !== 'APPROVED') {
      throw new BadRequestException('A coach has to approve this player first');
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
     * Every scout who backed this player was right, and this is where that
     * becomes true.
     *
     * Not at the invitation: a player invited to a look who never signs is not
     * an accepted recommendation, and counting it as one would inflate every
     * success rate on the platform. The reputation moves when the academy
     * actually takes the player on — and it moves for all of them, because they
     * all said the same thing.
     */
    const backings = await this.processA.backingsOf(
      applicationId,
      application.recommendationId ?? review?.recommendationId ?? null,
    );
    for (const recommendationId of backings) {
      await this.recommendations
        .updateStatus(
          userId,
          recommendationId,
          // Named explicitly: a global recommendation has no target to infer the
          // deciding academy from until this trial gives it one.
          { status: 'ACCEPTED', academyId: application.trial.academyId },
          { takeUpGlobal: true },
        )
        // One already-settled recommendation must not stop the others counting.
        .catch(() => undefined);
    }

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
    if (ageRangeMin > ageRangeMax) {
      throw new BadRequestException('The minimum age cannot be above the maximum');
    }

    return this.prisma.trial.update({
      where: { id: trialId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.ageRangeMin !== undefined ? { ageRangeMin: dto.ageRangeMin } : {}),
        ...(dto.ageRangeMax !== undefined ? { ageRangeMax: dto.ageRangeMax } : {}),
        ...(dto.positions !== undefined ? { positions: dto.positions } : {}),
        ...(dto.requirements !== undefined
          ? { requirements: dto.requirements.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async getById(trialId: string) {
    const trial = await this.prisma.trial.findUnique({ where: { id: trialId } });
    if (!trial) throw new NotFoundException('Trial not found');
    return trial;
  }

  /** Player applies to a trial (1.11: initial status = Applied). */
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

    const age = this.ageFromBirthDate(player.birthDate, trial.date);
    if (age < trial.ageRangeMin || age > trial.ageRangeMax) {
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

    /*
     * Process A, in `auto`: an open day can take fifty applications in a night
     * and a manager routing each one to a coach by hand is the bottleneck the
     * whole screening idea was meant to remove.
     *
     * A failure here does not fail the application. An academy with no coach yet
     * has nobody to screen for it, and a player who has applied has applied —
     * the row simply waits at APPLIED for the manager to route it.
     */
    try {
      const coaches = await this.prisma.trialCoach.findMany({
        where: { trialId },
        select: { coachUserId: true },
      });
      await this.processA.start({
        playerId: player.id,
        academyId: trial.academyId,
        mode: 'auto',
        coachPool: coaches.map((row) => row.coachUserId),
        trialApplicationId: application.id,
      });
      return this.prisma.trialApplication.update({
        where: { id: application.id },
        data: { status: 'SCREENING' },
      });
    } catch {
      return application;
    }
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
   * Who applied, with where Process A got to.
   *
   * The review comes back on the row because "waiting on a coach" and "a coach
   * said no" are different things a manager has to tell apart, and a status
   * alone cannot say which coach is holding it.
   */
  async listApplicationsForTrial(userId: string, trialId: string) {
    const trial = await this.getById(trialId);
    await this.assertAcademyManager(userId, trial.academyId);
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Academy Manager transitions: Applied -> Shortlisted -> Invited -> Rejected/Accepted (1.11). */
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

    const event = dto.status === 'INVITED' ? 'TRIAL_INVITATION' : 'TRIAL_RESULT';
    await this.notifications.notify(application.player.userId, event, {
      applicationId,
      trialId: application.trialId,
      status: dto.status,
    });

    return updated;
  }

  private ageFromBirthDate(birthDate: Date, atDate: Date): number {
    let age = atDate.getFullYear() - birthDate.getFullYear();
    const hasHadBirthdayThisYear =
      atDate.getMonth() > birthDate.getMonth() ||
      (atDate.getMonth() === birthDate.getMonth() && atDate.getDate() >= birthDate.getDate());
    if (!hasHadBirthdayThisYear) age -= 1;
    return age;
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
