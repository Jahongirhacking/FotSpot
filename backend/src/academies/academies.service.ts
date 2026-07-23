import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AddStaffMemberDto, CreateAcademyDto, UpdateAcademyDto } from './dto/academy.dto';

@Injectable()
export class AcademiesService {
  constructor(private prisma: PrismaService, private rbac: RbacService) {}

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

  async getPublicProfile(academyId: string) {
    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      include: { members: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');
    return academy;
  }

  async listPublic(region?: string) {
    return this.prisma.academyProfile.findMany({
      where: { status: 'VERIFIED', ...(region ? { region } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, academyId: string, dto: UpdateAcademyDto) {
    await this.assertManager(userId, academyId);
    return this.prisma.academyProfile.update({ where: { id: academyId }, data: dto });
  }

  /** Admin-only: approves/rejects a pending academy. On approval, the pending
   * manager membership is granted the `academy_manager` RBAC role. */
  async verify(academyId: string, approve: boolean) {
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

    return this.prisma.academyMember.upsert({
      where: { academyId_userId: { academyId, userId: dto.userId } },
      update: { role: dto.role, coachId },
      create: { academyId, userId: dto.userId, role: dto.role, coachId },
    });
  }

  async listStaff(academyId: string) {
    return this.prisma.academyMember.findMany({ where: { academyId } });
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
