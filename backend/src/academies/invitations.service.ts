import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { NotificationsService } from '../notifications/notifications.service';
import { SquadNotificationsService } from './squad-notifications.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { InviteMemberDto } from './dto/invitation.dto';
import { assertNotLocalTeam } from './academy-kind.util';
import {
  ACCEPT_UNDO_WINDOW_MS,
  INVITATIONS_QUEUE,
  SETTLE_ACCEPTANCE_JOB,
  SETTLE_ATTEMPTS,
  SETTLE_BACKOFF_MS,
  settleJobId,
  type SettleAcceptanceJob,
} from './invitations.constants';

/**
 * An academy asking somebody to join, and their answer.
 *
 * ## Why an academy cannot simply add people
 *
 * A membership decides who may assess a player, which squad they train with and
 * which club their profile advertises. Letting a manager write that onto another
 * account would mean a stranger could claim a child's record, and the child would
 * find out from their own profile page. So the manager sends an invitation, the
 * person answers, and only a yes creates the membership.
 *
 * ## Accepting lands you in the reserve
 *
 * Not in a squad. Which group somebody trains with is the manager's decision and
 * it is made after they are through the door, on the squad screen — the same
 * place everybody else's is.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private squads: SquadNotificationsService,
    private redis: RedisService,
    @InjectQueue(INVITATIONS_QUEUE) private queue: Queue<SettleAcceptanceJob>,
  ) {}

  /**
   * Ask somebody to join the academy.
   *
   * Nothing is written to their record here beyond the question itself. Every
   * check that would fail on acceptance is made now instead, so an invitation
   * that arrives is one the person can actually say yes to.
   */
  async invite(userId: string, academyId: string, dto: InviteMemberDto) {
    await this.assertManager(userId, academyId);
    if (dto.userId === userId) throw new BadRequestException('You already run this academy');

    /*
     * A local team may invite players and scouts, and no coaches at all.
     *
     * This is the door that matters: `createCoach` mints an account, but an
     * invitation is how an existing coach would be attached, and blocking only
     * the first would leave the rule enforced on one route out of two.
     *
     * Before the target is even looked up, because the answer does not depend
     * on them: telling a local team's manager "that account is not a coach"
     * sends them looking for a different person to invite, when the thing that
     * cannot happen is the invitation.
     */
    if (dto.role === 'COACH') {
      const academy = await this.prisma.academyProfile.findUnique({
        where: { id: academyId },
        select: { kind: true },
      });
      if (!academy) throw new NotFoundException('Academy not found');
      assertNotLocalTeam(academy.kind, 'have coaches');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
        coachProfile: { select: { status: true } },
      },
    });
    if (!target || !target.isActive) throw new NotFoundException('That account does not exist');

    // An academy cannot make somebody a player by listing them as one. The role
    // is the person's, and it is granted where roles are granted.
    const holdsRole = target.roles.some((held) => held.role.name === dto.role.toLowerCase());
    if (!holdsRole)
      throw new BadRequestException(`That account is not a ${dto.role.toLowerCase()}`);
    if (dto.role === 'COACH' && target.coachProfile?.status !== 'VERIFIED') {
      throw new BadRequestException('That coach is not verified yet');
    }

    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId: dto.userId } },
      select: { status: true },
    });
    if (membership && membership.status !== 'RELEASED') {
      throw new ConflictException('They are already at this academy');
    }

    const open = await this.prisma.academyInvitation.findFirst({
      where: { academyId, userId: dto.userId, status: 'PENDING' },
      select: { id: true },
    });
    if (open)
      throw new ConflictException('They have already been invited — waiting on their answer');

    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      // `kind` rides along for the notification: an academy and a local team ask
      // the same question with different words, and the player is the one being
      // asked. See the payload below.
      select: { id: true, name: true, kind: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');

    const invitation = await this.prisma.academyInvitation.create({
      data: {
        academyId,
        userId: dto.userId,
        role: dto.role,
        note: dto.note?.trim() || null,
        invitedByUserId: userId,
      },
    });

    /*
     * The payload carries the academy's name so the notification reads like a
     * sentence without the client having to fetch anything to render it — and
     * its `kind` for the same reason.
     *
     * "An academy is inviting you to join" is the wrong sentence when a local
     * team sent it: the two are different things to be invited by (LOCAL_TEAM.md
     * §4/§20), and the player deciding is exactly the person who should not have
     * to work out which one this is. The wording is the client's to choose, in
     * their language; what belongs here is the fact it needs.
     */
    await this.notifications.notify(
      dto.userId,
      'ACADEMY_JOIN_INVITATION',
      {
        invitationId: invitation.id,
        academyId: academy.id,
        academyName: academy.name,
        academyKind: academy.kind,
        role: dto.role,
        ...(invitation.note ? { note: invitation.note } : {}),
      },
      { userId, role: 'academy_manager' },
    );

    await this.audit.record(userId, AuditAction.ACADEMY_INVITATION_SENT, {
      academyId,
      invitedUserId: dto.userId,
      role: dto.role,
    });

    return invitation;
  }

  /** Everything an academy has asked of somebody, newest first. */
  async listForAcademy(userId: string, academyId: string) {
    await this.assertManager(userId, academyId);

    const invitations = await this.prisma.academyInvitation.findMany({
      where: { academyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            avatarKey: true,
          },
        },
      },
    });

    return invitations.map(({ user, ...invitation }) => ({
      ...invitation,
      user: { ...user, avatarUrl: this.storage.publicUrlOrNull(user.avatarKey) },
    }));
  }

  /** What has been asked of me. */
  async listMine(userId: string) {
    const invitations = await this.prisma.academyInvitation.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
      include: {
        academy: {
          // `kind` so the card can say what is inviting them, like the
          // notification that brought them here.
          select: { id: true, name: true, region: true, district: true, status: true, kind: true },
        },
      },
    });

    return invitations;
  }

  /**
   * The invited person's answer — the only place a membership is created this way.
   *
   * ## A no is final; a yes has a moment's grace
   *
   * Declining is written at once, with whatever the person wanted to say to
   * the manager, and the manager is told. Accepting is *recorded* at once —
   * the invitation reads ACCEPTED, the screen says so — but the membership,
   * the manager's notification and any release from a previous club are
   * written by `settleAcceptance` after `ACCEPT_UNDO_WINDOW_MS`, so a
   * mis-tapped yes can be taken back before anything has happened (see
   * invitations.constants.ts).
   *
   * Re-checked on acceptance rather than trusted from invitation time: an
   * invitation can sit unanswered for weeks, and in that time the person may
   * have joined somewhere else or the academy may have taken them on by
   * transfer.
   */
  async decide(userId: string, invitationId: string, accept: boolean, note?: string) {
    const invitation = await this.prisma.academyInvitation.findUnique({
      where: { id: invitationId },
      include: { academy: { select: { id: true, name: true, kind: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.userId !== userId) {
      throw new ForbiddenException('That invitation was not addressed to you');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('You have already answered this invitation');
    }

    if (!accept) {
      const answerNote = note?.trim() || null;
      const rejected = await this.prisma.academyInvitation.update({
        where: { id: invitationId },
        data: { status: 'REJECTED', decidedAt: new Date(), answerNote },
      });
      await this.announce(invitation.invitedByUserId, invitation, false, answerNote);
      await this.audit.record(userId, AuditAction.ACADEMY_INVITATION_ANSWERED, {
        invitationId,
        academyId: invitation.academyId,
        accepted: false,
      });
      return rejected;
    }

    const existing = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId: invitation.academyId, userId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'RELEASED') {
      throw new ConflictException('You are already at this academy');
    }

    const accepted = await this.prisma.academyInvitation.update({
      where: { id: invitationId },
      data: { status: 'ACCEPTED', decidedAt: new Date(), settledAt: null },
    });
    await this.scheduleSettlement(invitationId, ACCEPT_UNDO_WINDOW_MS);

    return { ...accepted, undoUntil: new Date(Date.now() + ACCEPT_UNDO_WINDOW_MS) };
  }

  /**
   * Takes a yes back, inside the window — the person's own, before the
   * membership has been written. Refused once it has: they are in the squad
   * now, and leaving is a different act with a different screen.
   */
  async undoAcceptance(userId: string, invitationId: string) {
    const invitation = await this.prisma.academyInvitation.findUnique({
      where: { id: invitationId },
      select: { id: true, userId: true, status: true, settledAt: true },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.userId !== userId) {
      throw new ForbiddenException('That invitation was not addressed to you');
    }
    if (invitation.status !== 'ACCEPTED') {
      throw new BadRequestException('There is no acceptance to undo');
    }
    if (invitation.settledAt) {
      throw new ConflictException('You have already joined; this can no longer be undone');
    }

    // Removed first: a settlement that ran while the row was being reverted
    // would write a membership for a yes that no longer exists.
    const job = await this.queue.getJob(settleJobId(invitationId));
    if (job) await job.remove();

    return this.prisma.academyInvitation.update({
      where: { id: invitationId },
      data: { status: 'PENDING', decidedAt: null },
    });
  }

  /**
   * What a yes sets in motion, once the undo window has closed: the
   * membership, the release from a previous club, the endorsement for staff,
   * and the manager's notification. Idempotent — the row is claimed under a
   * guard, so a retried job writes nothing twice — and a yes that was undone
   * has no row at ACCEPTED, and settles nothing.
   */
  async settleAcceptance(invitationId: string) {
    const invitation = await this.prisma.academyInvitation.findUnique({
      where: { id: invitationId },
      include: { academy: { select: { id: true, name: true, kind: true } } },
    });
    if (!invitation || invitation.status !== 'ACCEPTED') {
      return { settled: false as const, reason: 'undone' as const };
    }
    const claimed = await this.prisma.academyInvitation.updateMany({
      where: { id: invitationId, status: 'ACCEPTED', settledAt: null },
      data: { settledAt: new Date() },
    });
    if (claimed.count === 0) return { settled: false as const, reason: 'already' as const };

    const { userId } = invitation;

    // A coach's membership points at their profile so their assessments stay
    // attributable to the club they made them at.
    const coachProfile =
      invitation.role === 'COACH'
        ? await this.prisma.coachProfile.findUnique({ where: { userId }, select: { id: true } })
        : null;

    /*
     * Who they are leaving, if anybody.
     *
     * A player belongs to at most one academy at a time (PLAYER_SQUAD.md §3),
     * and accepting an academy's invitation is one of only two ways that can
     * change — the other being a transfer both academies agreed to. The
     * previous membership is released rather than deleted, so the record of
     * where they were stays. A local team is not an academy for this purpose:
     * a player may be at a neighbourhood team and an academy at once.
     */
    const leaving =
      invitation.role === 'PLAYER' && invitation.academy.kind === 'ACADEMY'
        ? await this.prisma.academyMember.findFirst({
            where: {
              userId,
              role: 'PLAYER',
              status: 'ACTIVE',
              academyId: { not: invitation.academyId },
              academy: { kind: 'ACADEMY' },
            },
            select: { id: true, academyId: true, academy: { select: { name: true } } },
          })
        : null;

    await this.prisma.$transaction(async (tx) => {
      if (leaving) {
        await tx.academyMember.update({
          where: { id: leaving.id },
          data: { status: 'RELEASED', releasedAt: new Date(), groupId: null },
        });
      }

      await tx.academyMember.upsert({
        where: { academyId_userId: { academyId: invitation.academyId, userId } },
        // Rejoining after a release starts over: reserve, active, no squad.
        update: {
          role: invitation.role,
          status: 'ACTIVE',
          releasedAt: null,
          groupId: null,
          coachId: coachProfile?.id ?? null,
        },
        create: {
          academyId: invitation.academyId,
          userId,
          role: invitation.role,
          coachId: coachProfile?.id ?? null,
        },
      });

      // Joining as a coach or a scout *is* the endorsement. An academy that has
      // taken somebody onto its staff has already vouched for them, and asking
      // it to say so a second time on another screen only produced staff whose
      // recommendations the academy would not accept from its own people.
      if (invitation.role === 'COACH' || invitation.role === 'SCOUT') {
        const role = invitation.role;
        await tx.academyEndorsement.upsert({
          where: {
            academyId_userId_role: { academyId: invitation.academyId, userId, role },
          },
          update: { status: 'ACTIVE', revokedAt: null },
          create: { academyId: invitation.academyId, userId, role },
        });
      }
    });

    await this.announce(invitation.invitedByUserId, invitation, true);
    await this.squads.announceJoined(invitation.academyId, userId, userId);
    if (leaving) {
      await this.squads.announceLeft(leaving.academyId, userId, userId);
    }

    await this.redis.del(
      RedisKeys.academyProfile(invitation.academyId),
      ...(leaving ? [RedisKeys.academyProfile(leaving.academyId)] : []),
    );

    await this.audit.record(userId, AuditAction.ACADEMY_INVITATION_ANSWERED, {
      invitationId,
      academyId: invitation.academyId,
      accepted: true,
    });

    return { settled: true as const };
  }

  /** Re-queues any yes whose settlement never ran. Called at boot by the processor. */
  async settleOverdueAcceptances() {
    const overdue = await this.prisma.academyInvitation.findMany({
      where: {
        status: 'ACCEPTED',
        settledAt: null,
        decidedAt: { lt: new Date(Date.now() - ACCEPT_UNDO_WINDOW_MS) },
      },
      select: { id: true },
    });
    for (const { id } of overdue) await this.scheduleSettlement(id, 0);
    return overdue.length;
  }

  private async scheduleSettlement(invitationId: string, delay: number) {
    await this.queue.add(
      SETTLE_ACCEPTANCE_JOB,
      { invitationId },
      {
        jobId: settleJobId(invitationId),
        delay,
        attempts: SETTLE_ATTEMPTS,
        backoff: { type: 'exponential', delay: SETTLE_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async cancel(userId: string, invitationId: string) {
    const invitation = await this.prisma.academyInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    await this.assertManager(userId, invitation.academyId);
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('That invitation has already been answered');
    }

    return this.prisma.academyInvitation.update({
      where: { id: invitationId },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    });
  }

  /** Tells the manager who asked, so a yes is not something they discover. */
  private async announce(
    managerUserId: string,
    invitation: { academyId: string; userId: string; role: string; academy: { name: string } },
    accepted: boolean,
    note: string | null = null,
  ) {
    await this.notifications.notify(
      managerUserId,
      'ACADEMY_JOIN_ANSWER',
      {
        academyId: invitation.academyId,
        academyName: invitation.academy.name,
        userId: invitation.userId,
        role: invitation.role,
        accepted,
        // What they said when declining, if anything — the manager reads it here.
        ...(note ? { note } : {}),
      },
      // The person answering, in the capacity they were invited in.
      { userId: invitation.userId, role: invitation.role.toLowerCase() },
    );
  }

  private async assertManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, academyId, role: 'MANAGER' },
    });
    if (!membership) throw new ForbiddenException('Only this academy’s manager can do that');
  }
}
