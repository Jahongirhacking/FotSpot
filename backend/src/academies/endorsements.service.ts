import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { EndorsementRole, EndorsementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';

/**
 * Academy → scout/coach endorsements ("hiring") — README 1.5.3.
 *
 * The functional counterpart to `AcademyScoutFollow`, which is social and changes
 * nothing. Endorsement is what lets a scout address a recommendation to this
 * academy, and what earns that recommendation its extra weight.
 */
@Injectable()
export class EndorsementsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async endorse(
    actorId: string,
    academyId: string,
    dto: { userId: string; role: EndorsementRole; note?: string },
  ) {
    await this.assertManager(actorId, academyId);

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('That account does not exist');

    if (dto.role === EndorsementRole.COACH) {
      // Only a verified coach can be endorsed as one — endorsing an unverified
      // coach would let an academy manufacture the credential the platform is
      // supposed to be checking (README §1.9).
      const coach = await this.prisma.coachProfile.findUnique({ where: { userId: dto.userId } });
      if (!coach || coach.status !== 'VERIFIED') {
        throw new BadRequestException('That user is not a verified coach');
      }
    }

    const endorsement = await this.prisma.academyEndorsement.upsert({
      where: {
        academyId_userId_role: { academyId, userId: dto.userId, role: dto.role },
      },
      // Re-endorsing someone previously dropped reactivates the same row, keeping
      // the original createdAt and the history attached to it.
      update: { status: EndorsementStatus.ACTIVE, revokedAt: null, note: dto.note },
      create: { academyId, userId: dto.userId, role: dto.role, note: dto.note },
    });

    await this.audit.record(actorId, AuditAction.ENDORSEMENT_GRANTED, {
      academyId,
      userId: dto.userId,
      role: dto.role,
    });

    return endorsement;
  }

  /**
   * Ends the working relationship. The row is kept as REVOKED rather than deleted:
   * recommendations the scout already made for this academy stay valid and
   * explicable, and re-endorsing later shouldn't look like a brand-new hire.
   */
  async revoke(actorId: string, academyId: string, userId: string, role: EndorsementRole) {
    await this.assertManager(actorId, academyId);

    const endorsement = await this.prisma.academyEndorsement.update({
      where: { academyId_userId_role: { academyId, userId, role } },
      data: { status: EndorsementStatus.REVOKED, revokedAt: new Date() },
    });

    await this.audit.record(actorId, AuditAction.ENDORSEMENT_REVOKED, {
      academyId,
      userId,
      role,
    });

    return endorsement;
  }

  /** The academy's roster of endorsed scouts and coaches. */
  async listForAcademy(actorId: string, academyId: string, role?: EndorsementRole) {
    await this.assertManager(actorId, academyId);

    return this.prisma.academyEndorsement.findMany({
      where: { academyId, ...(role ? { role } : {}) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * The academies that have endorsed this user — i.e. the ones they may address a
   * specific recommendation to. Drives the academy picker in the client, so it can
   * only ever offer valid choices.
   */
  async listForUser(userId: string, role: EndorsementRole = EndorsementRole.SCOUT) {
    return this.prisma.academyEndorsement.findMany({
      where: { userId, role, status: EndorsementStatus.ACTIVE },
      include: {
        academy: { select: { id: true, name: true, region: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** True when this academy currently endorses this user in this capacity. */
  async isEndorsed(
    academyId: string,
    userId: string,
    role: EndorsementRole = EndorsementRole.SCOUT,
  ): Promise<boolean> {
    const endorsement = await this.prisma.academyEndorsement.findUnique({
      where: { academyId_userId_role: { academyId, userId, role } },
      select: { status: true },
    });
    return endorsement?.status === EndorsementStatus.ACTIVE;
  }

  /** Subset of `academyIds` that currently endorse this user. */
  async filterEndorsing(
    academyIds: string[],
    userId: string,
    role: EndorsementRole = EndorsementRole.SCOUT,
  ): Promise<string[]> {
    const rows = await this.prisma.academyEndorsement.findMany({
      where: {
        userId,
        role,
        status: EndorsementStatus.ACTIVE,
        academyId: { in: academyIds },
      },
      select: { academyId: true },
    });
    return rows.map((row) => row.academyId);
  }

  private async assertManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can manage endorsements');
    }
    return membership;
  }
}
