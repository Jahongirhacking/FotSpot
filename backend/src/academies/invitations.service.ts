import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      select: { id: true, name: true },
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

    // The payload carries the academy's name so the notification reads like a
    // sentence without the client having to fetch anything to render it.
    await this.notifications.notify(
      dto.userId,
      'ACADEMY_JOIN_INVITATION',
      {
        invitationId: invitation.id,
        academyId: academy.id,
        academyName: academy.name,
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
          select: { id: true, name: true, region: true, district: true, status: true },
        },
      },
    });

    return invitations;
  }

  /**
   * The invited person's answer — the only place a membership is created this way.
   *
   * Re-checked on acceptance rather than trusted from invitation time: an
   * invitation can sit unanswered for weeks, and in that time the person may have
   * joined somewhere else or the academy may have taken them on by transfer.
   */
  async decide(userId: string, invitationId: string, accept: boolean) {
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
      const rejected = await this.prisma.academyInvitation.update({
        where: { id: invitationId },
        data: { status: 'REJECTED', decidedAt: new Date() },
      });
      await this.announce(invitation.invitedByUserId, invitation, false);
      return rejected;
    }

    const existing = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId: invitation.academyId, userId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'RELEASED') {
      throw new ConflictException('You are already at this academy');
    }

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
     * change — the other is the manager removing them. Local teams are not in
     * this query: a player may be in any number of those at once, and joining
     * an academy takes them out of none of them (§7).
     *
     * Read before the transaction and closed inside it. Reading it here costs
     * one indexed lookup and keeps the transaction to writes; the row cannot
     * meaningfully change in between, because the only two things that would
     * change it are this endpoint and a manager acting on the same player, and
     * whichever lands second leaves a consistent state either way.
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

    const accepted = await this.prisma.$transaction(async (tx) => {
      /*
       * The old academy closes in the same transaction that opens the new one.
       *
       * Either both happen or neither does — the two states this rules out are
       * a player showing at two academies, and a player showing at none after
       * accepting an invitation. RELEASED rather than deleted, because the
       * membership is the history: `joinedAt` stays, `releasedAt` records the
       * end, and the academy that trained them keeps its record of having done
       * so (§4).
       */
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

      return tx.academyInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED', decidedAt: new Date() },
      });
    });

    await this.announce(invitation.invitedByUserId, invitation, true);
    /*
     * The squads that changed, told after the write landed (§17).
     *
     * Inside the transaction a rollback would leave a manager reading that
     * somebody joined a squad they are not in. Out here the worst case is the
     * opposite and much cheaper: the membership is real and one message did not
     * arrive.
     *
     * Two messages, not one: the academy taking the player on and the academy
     * losing them are different people who each need to know, and the departure
     * is the one nobody would otherwise be told about.
     */
    await this.squads.announceJoined(invitation.academyId, userId, userId);
    if (leaving) {
      await this.squads.announceLeft(leaving.academyId, userId, userId);
    }

    /*
     * Both academies' cached profiles, because both squads changed.
     *
     * `AcademiesService.getPublicProfile` caches the academy *with its members*
     * for five minutes, and nothing on this path was clearing it — so a manager
     * who watched somebody accept saw the old member count until the TTL ran
     * out, which reads as the acceptance not having worked. A transfer touches
     * two academies, and the one losing the player is the one that would
     * otherwise keep showing them (§25).
     */
    await this.redis.del(
      RedisKeys.academyProfile(invitation.academyId),
      ...(leaving ? [RedisKeys.academyProfile(leaving.academyId)] : []),
    );

    await this.audit.record(userId, AuditAction.ACADEMY_INVITATION_ANSWERED, {
      invitationId,
      academyId: invitation.academyId,
      accepted: true,
    });

    return accepted;
  }

  /** Withdrawing a question nobody has answered yet. */
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
