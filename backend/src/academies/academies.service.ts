import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { AddStaffMemberDto, CreateAcademyDto, UpdateAcademyDto } from './dto/academy.dto';

@Injectable()
export class AcademiesService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
    private audit: AuditService,
  ) {}

  /**
   * Creates an academy. **Admin / super_admin only** — enforced by @Roles on the
   * controller.
   *
   * This replaces self-registration + admin review (the original README §1.10
   * flow). Uzbekistan has roughly fifty football academies in total: at that scale
   * a self-service queue is more attack surface than convenience, since almost
   * every submission would be either a duplicate or a fake, and each one is an
   * institution asking for access to children (§11). The platform team onboards
   * them instead.
   *
   * Because an admin has therefore already vetted the academy, it is created
   * VERIFIED rather than PENDING — there is no second reviewer to wait for.
   *
   * `actorId` is the admin. It is NOT made the manager: an admin creating a record
   * on someone else's behalf shouldn't end up running it.
   */
  async register(actorId: string, dto: CreateAcademyDto) {
    const { managerUserId, ...profile } = dto;

    if (managerUserId) {
      const manager = await this.prisma.user.findUnique({ where: { id: managerUserId } });
      if (!manager) throw new BadRequestException('That manager account does not exist');
      await this.assertNotPlayer(managerUserId);
    }

    const academy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.academyProfile.create({
        data: { ...profile, status: 'VERIFIED' },
      });

      if (managerUserId) {
        await tx.academyMember.create({
          data: { academyId: created.id, userId: managerUserId, role: 'MANAGER' },
        });
        await this.rbac.assignRole(managerUserId, 'academy_manager', tx);
      }

      return created;
    });

    await this.invalidate(academy.id, academy.region);
    await this.audit.record(actorId, AuditAction.ACADEMY_VERIFIED, {
      academyId: academy.id,
      createdByAdmin: true,
      managerUserId: managerUserId ?? null,
    });

    return academy;
  }

  /**
   * A player account cannot manage an academy.
   *
   * Most player accounts belong to minors (README §11), and an academy is the
   * institution that recruits them — one account being both is a safeguarding
   * hole, not merely an odd UI state. Checked against the database rather than the
   * JWT so a stale token can't slip past.
   */
  private async assertNotPlayer(userId: string) {
    const playerRole = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: 'player' } },
    });

    if (playerRole) {
      throw new ForbiddenException(
        'A player account cannot manage an academy. Use a separate account for academy staff.',
      );
    }
  }

  /** Read-heavy, slow-changing (1.19) - served from cache, invalidated on every write below. */
  async getPublicProfile(academyId: string) {
    const academy = await this.redis.wrap(
      RedisKeys.academyProfile(academyId),
      CacheTtl.academyProfile,
      () =>
        this.prisma.academyProfile.findUnique({
          where: { id: academyId },
          include: { members: true },
        }),
    );
    if (!academy) throw new NotFoundException('Academy not found');
    return academy;
  }

  async listPublic(region?: string) {
    return this.redis.wrap(RedisKeys.academyList(region), CacheTtl.academyList, () =>
      this.prisma.academyProfile.findMany({
        where: { status: 'VERIFIED', ...(region ? { region } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** Admin console: every academy regardless of status, newest first. */
  async listAll() {
    return this.prisma.academyProfile.findMany({
      include: { members: { where: { role: 'MANAGER' }, select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, academyId: string, dto: UpdateAcademyDto, isAdmin = false) {
    // Admins onboard academies (§1.10) and therefore have to be able to correct
    // them; a manager can still edit their own.
    if (!isAdmin) await this.assertManager(userId, academyId);
    const updated = await this.prisma.academyProfile.update({
      where: { id: academyId },
      data: dto,
    });
    await this.invalidate(academyId, updated.region);
    return updated;
  }

  /** Admin-only: approves/rejects a pending academy. On approval, the pending
   * manager membership is granted the `academy_manager` RBAC role. */
  async verify(academyId: string, approve: boolean, actorId: string | null = null) {
    const academy = await this.prisma.academyProfile.findUnique({ where: { id: academyId } });
    if (!academy) throw new NotFoundException('Academy not found');

    const updated = await this.prisma.academyProfile.update({
      where: { id: academyId },
      data: { status: approve ? 'VERIFIED' : 'REJECTED' },
    });

    if (approve) {
      const manager = await this.prisma.academyMember.findFirst({
        where: { academyId, role: 'MANAGER' },
      });
      if (manager) await this.rbac.assignRole(manager.userId, 'academy_manager');
    }

    await this.invalidate(academyId, updated.region);
    await this.audit.record(actorId, AuditAction.ACADEMY_VERIFIED, { academyId, approve });
    return updated;
  }

  /**
   * Archives an academy — admin only.
   *
   * Sets status to REJECTED rather than deleting the row. A hard delete would
   * cascade through its trials, applications and recommendation targets, silently
   * destroying scouts' reputation history and players' application records for
   * what is usually a duplicate entry. Archived academies drop out of the public
   * list because that already filters on VERIFIED.
   */
  async archive(actorId: string, academyId: string) {
    const academy = await this.prisma.academyProfile.findUnique({ where: { id: academyId } });
    if (!academy) throw new NotFoundException('Academy not found');

    const archived = await this.prisma.academyProfile.update({
      where: { id: academyId },
      data: { status: 'REJECTED' },
    });

    await this.invalidate(academyId, archived.region);
    await this.audit.record(actorId, AuditAction.ACADEMY_VERIFIED, {
      academyId,
      archived: true,
    });

    return archived;
  }

  async addStaff(userId: string, academyId: string, dto: AddStaffMemberDto) {
    await this.assertManager(userId, academyId);

    let coachId: string | undefined;
    if (dto.role === 'COACH') {
      const coachProfile = await this.prisma.coachProfile.findUnique({
        where: { userId: dto.userId },
      });
      if (!coachProfile || coachProfile.status !== 'VERIFIED') {
        throw new BadRequestException('User is not a verified coach');
      }
      coachId = coachProfile.id;
    }

    const member = await this.prisma.academyMember.upsert({
      where: { academyId_userId: { academyId, userId: dto.userId } },
      update: { role: dto.role, coachId },
      create: { academyId, userId: dto.userId, role: dto.role, coachId },
    });
    // getPublicProfile includes members, so a staff change invalidates it too.
    await this.invalidate(academyId);
    return member;
  }

  async listStaff(academyId: string) {
    return this.prisma.academyMember.findMany({ where: { academyId } });
  }

  /**
   * Drops every cache entry a write to this academy could have staled: its own
   * profile, plus the region list it appears in and the unfiltered "all" list.
   */
  private async invalidate(academyId: string, region?: string | null) {
    await this.redis.del(
      RedisKeys.academyProfile(academyId),
      RedisKeys.academyList(undefined),
      ...(region ? [RedisKeys.academyList(region)] : []),
    );
  }

  private async assertManager(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
    });
    if (!membership || membership.role !== 'MANAGER') {
      throw new ForbiddenException('Only the academy manager can perform this action');
    }
    return membership;
  }
}
