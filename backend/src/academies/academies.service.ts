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

  /** 1.10: Request -> Admin Review -> Approved. Creator becomes the pending manager. */
  async register(userId: string, dto: CreateAcademyDto) {
    return this.prisma.$transaction(async (tx) => {
      const academy = await tx.academyProfile.create({ data: { ...dto } });
      await tx.academyMember.create({
        data: { academyId: academy.id, userId, role: 'MANAGER' },
      });
      return academy;
    });
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

  async update(userId: string, academyId: string, dto: UpdateAcademyDto) {
    await this.assertManager(userId, academyId);
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
