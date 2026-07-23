import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Default role catalogue per README 1.2.
 * "guest" is not persisted - it is the absence of a JWT.
 */
export const DEFAULT_ROLES = [
  'scout', // default role after registration
  'player',
  'coach',
  'academy_manager',
  'admin',
  'super_admin',
] as const;

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  /** Idempotently ensure the default roles exist. Call from a seed script / onModuleInit. */
  async ensureDefaultRoles() {
    for (const name of DEFAULT_ROLES) {
      await this.prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }
  }

  async assignRole(userId: string, roleName: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  async removeRole(userId: string, roleName: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    return this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
  }

  /** Returns flattened role names + permission keys for embedding in a JWT payload. */
  async getEffectiveAccess(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const roles = userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)),
      ),
    );

    return { roles, permissions };
  }
}
