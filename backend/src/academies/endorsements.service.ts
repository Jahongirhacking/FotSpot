import { ForbiddenException, Injectable } from '@nestjs/common';
import { EndorsementRole, EndorsementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';

/**
 * Academy → scout/coach endorsements ("hiring") — README 1.5.3.
 *
 * The functional counterpart to `AcademyScoutFollow`, which is social and changes
 * nothing. Endorsement is what lets a scout address a recommendation to this
 * academy, and what earns that recommendation its extra weight.
 *
 * Read-only from here on. The rows are written where the relationship actually
 * changes — accepting an invitation to join the staff grants the endorsement,
 * being expelled revokes it — so there is no second way to hand out an academy's
 * trust that could disagree with who works there.
 */
@Injectable()
export class EndorsementsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  async listForAcademy(actorId: string, academyId: string, role?: EndorsementRole) {
    await this.assertManager(actorId, academyId);

    const rows = await this.prisma.academyEndorsement.findMany({
      where: { academyId, ...(role ? { role } : {}) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({ ...row, user: this.storage.withAvatarUrl(row.user) }));
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
