import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  /**
   * Full detail on one user — read-only, available to any admin.
   *
   * Admins moderate and support the platform, so they need to see who someone is
   * and what they've done. They cannot change it: user mutations are super-admin
   * only, because "can look" and "can alter" are very different powers over an
   * account that may belong to a child (README §11).
   */
  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
        playerProfile: {
          select: {
            id: true,
            birthDate: true,
            primaryPosition: true,
            playingStyle: true,
            region: true,
            matches: true,
            goals: true,
            assists: true,
            _count: { select: { media: true, trialApplications: true, recommendations: true } },
          },
        },
        coachProfile: {
          select: { id: true, status: true, bio: true, _count: { select: { assessments: true } } },
        },
        academyMemberships: {
          select: { academyId: true, role: true, academy: { select: { name: true } } },
        },
        _count: { select: { recommendationsMade: true, sessions: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const scoutStats = await this.prisma.scoutStats.findUnique({ where: { userId } });
    const { roles, ...rest } = user;

    return {
      ...rest,
      roles: roles.map((entry) => entry.role.name),
      scoutStats,
    };
  }

  /**
   * Enable or disable an account — **super admin only**.
   *
   * Disabling is the reversible alternative to deletion: the user cannot sign in
   * (AuthService checks `isActive`), but their recommendations, assessments and
   * the reputation other people earned around them stay intact.
   */
  async setUserActive(actorId: string, userId: string, isActive: boolean) {
    if (actorId === userId && !isActive) {
      throw new BadRequestException('You cannot disable your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (!target) throw new NotFoundException('User not found');

    if (!isActive && target.roles.some((entry) => entry.role.name === 'super_admin')) {
      throw new ForbiddenException('A super admin account cannot be disabled');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, isActive: true },
    });

    await this.audit.record(actorId, isActive ? AuditAction.USER_ENABLED : AuditAction.USER_DISABLED, {
      userId,
    });

    return user;
  }

  /** Grant or remove any role — **super admin only**. */
  async setUserRole(actorId: string, userId: string, roleName: string, grant: boolean) {
    if (roleName === 'super_admin' && !grant) {
      throw new ForbiddenException('Super admin cannot be revoked here');
    }

    if (grant) {
      await this.rbac.assignRole(userId, roleName);
      await this.audit.record(actorId, AuditAction.ROLE_ASSIGNED, { userId, roleName });
    } else {
      await this.rbac.removeRole(userId, roleName).catch(() => undefined);
      await this.audit.record(actorId, AuditAction.ROLE_REMOVED, { userId, roleName });
    }

    return this.rbac.getEffectiveAccess(userId);
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
