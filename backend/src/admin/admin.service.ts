import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CoachesService } from '../coaches/coaches.service';
import { AcademiesService } from '../academies/academies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private coachesService: CoachesService,
    private academiesService: AcademiesService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  // ---- Admin (1.2: Verify coaches, Verify academies, Moderate) ----
  // `actorId` is threaded down so the audit row names the admin who acted (1.21),
  // not just the fact that something was verified.

  async verifyCoach(actorId: string, coachProfileId: string, approve: boolean) {
    const result = await this.coachesService.verify(coachProfileId, approve, actorId);
    await this.notifications.notify(result.userId, 'VERIFICATION_RESULT', {
      subject: 'coach',
      approved: approve,
    });
    return result;
  }

  async verifyAcademy(actorId: string, academyId: string, approve: boolean) {
    const result = await this.academiesService.verify(academyId, approve, actorId);
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
    return this.audit.listRecent(take);
  }

  // ---- Super Admin only (1.2: CRUD Admins/Roles/Permissions, Feature Flags) ----
  // Admin itself is explicitly barred from creating admins (1.2 restriction);
  // these methods are only reachable via the super_admin-gated controller routes.

  async assignAdmin(actorId: string, userId: string) {
    await this.rbac.assignRole(userId, 'admin');
    await this.audit.record(actorId, AuditAction.ADMIN_ASSIGNED, { userId });
    return { assigned: true, userId };
  }

  async revokeAdmin(actorId: string, userId: string) {
    await this.rbac.removeRole(userId, 'admin');
    await this.audit.record(actorId, AuditAction.ADMIN_REVOKED, { userId });
    return { revoked: true, userId };
  }

  async createPermission(actorId: string, key: string) {
    const permission = await this.prisma.permission.create({ data: { key } });
    await this.audit.record(actorId, AuditAction.PERMISSION_CREATED, {
      permissionId: permission.id,
      key,
    });
    return permission;
  }

  async grantRolePermission(actorId: string, roleId: string, permissionId: string) {
    const grant = await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
    await this.audit.record(actorId, AuditAction.ROLE_PERMISSION_GRANTED, {
      roleId,
      permissionId,
    });
    return grant;
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });
  }
}
