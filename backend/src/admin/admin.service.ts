import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
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

  /**
   * User lookup for the admin console.
   *
   * Exists because promoting someone to admin, or endorsing them, previously meant
   * pasting a UUID from the database — a step that invites pasting the wrong one.
   * Admin-gated: a public user directory is not something this platform should
   * have, given most accounts belong to minors (README §11.3).
   */
  async searchUsers(query: string, page = 1, pageSize = 20) {
    const term = query.trim();
    const where: Prisma.UserWhereInput = term
      ? {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarUrl: true,
          createdAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(({ roles, ...user }) => ({
        ...user,
        roles: roles.map((entry) => entry.role.name),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Everyone currently holding admin or super_admin. */
  async listAdmins() {
    const admins = await this.prisma.user.findMany({
      where: { roles: { some: { role: { name: { in: ['admin', 'super_admin'] } } } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return admins.map(({ roles, ...user }) => ({
      ...user,
      roles: roles.map((entry) => entry.role.name),
      // A super admin cannot be demoted through this screen — the seeded bootstrap
      // account must stay reachable, and locking everyone out is unrecoverable.
      revocable: !roles.some((entry) => entry.role.name === 'super_admin'),
    }));
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
