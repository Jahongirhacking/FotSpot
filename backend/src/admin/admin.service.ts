import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CoachesService } from '../coaches/coaches.service';
import { AcademiesService } from '../academies/academies.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private coachesService: CoachesService,
    private academiesService: AcademiesService,
    private notifications: NotificationsService,
  ) {}

  // ---- Admin (1.2: Verify coaches, Verify academies, Moderate) ----

  async verifyCoach(coachProfileId: string, approve: boolean) {
    const result = await this.coachesService.verify(coachProfileId, approve);
    await this.notifications.notify(result.userId, 'VERIFICATION_RESULT', {
      subject: 'coach',
      approved: approve,
    });
    return result;
  }

  async verifyAcademy(academyId: string, approve: boolean) {
    const result = await this.academiesService.verify(academyId, approve);
    const manager = await this.prisma.academyMember.findFirst({
      where: { academyId, role: 'MANAGER' },
    });
    if (manager) {
      await this.notifications.notify(manager.userId, 'VERIFICATION_RESULT', {
        subject: 'academy',
        approved: approve,
      });
    }
    return result;
  }

  async listAuditLogs(take = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  }

  async log(userId: string | null, action: string, meta?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        action,
        meta: meta as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ---- Super Admin only (1.2: CRUD Admins/Roles/Permissions, Feature Flags) ----
  // Admin itself is explicitly barred from creating admins (1.2 restriction);
  // these methods are only reachable via the super_admin-gated controller routes.

  async assignAdmin(userId: string) {
    await this.rbac.assignRole(userId, 'admin');
    return this.log(null, 'admin.assigned', { userId });
  }

  async revokeAdmin(userId: string) {
    await this.rbac.removeRole(userId, 'admin');
    return this.log(null, 'admin.revoked', { userId });
  }

  async createPermission(key: string) {
    return this.prisma.permission.create({ data: { key } });
  }

  async grantRolePermission(roleId: string, permissionId: string) {
    return this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
  }

  async listRoles() {
    return this.prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
  }
}
