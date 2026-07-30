import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

/**
 * Either the PrismaService or a transaction client handed to `$transaction`.
 * Narrowed to the delegates this service touches so callers can pass `tx` without
 * the two types disagreeing over `$transaction` itself.
 */
type PrismaTransaction = Pick<PrismaService, 'role' | 'userRole'>;

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * The role catalogue is infrastructure, not seed data.
   *
   * Without it `assignRole` throws on every signup: the user row commits, the role
   * grant fails, and the retry hits "Email already registered" forever. Leaving it
   * to `pnpm seed` meant one forgotten command broke registration, OTP login and
   * player-profile creation at once, in ways whose error messages pointed nowhere
   * near the cause. Roles are upserted, so this is safe on every boot.
   */
  async onModuleInit() {
    await this.ensureDefaultRoles();
  }

  /** Idempotent; safe to call repeatedly. */
  async ensureDefaultRoles() {
    try {
      for (const name of DEFAULT_ROLES) {
        await this.prisma.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
      }
    } catch (err) {
      // Don't take the whole app down if the database isn't up yet — but say so
      // loudly, because every signup will fail until this succeeds.
      this.logger.error(
        `Could not ensure default roles — registration will fail until the database is reachable: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /**
   * `tx` lets callers run the grant inside their own transaction, so "create the
   * user and give them a role" is one atomic step. Without it a failed grant left
   * a committed user with no roles — an account that could never register again
   * (409) and whose JWT carried `roles: []`.
   */
  async assignRole(userId: string, roleName: string, tx: PrismaTransaction = this.prisma) {
    const role = await tx.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    return tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }

  /**
   * Grants `roleName` only if the user currently holds no roles at all.
   *
   * Repairs accounts created while the role catalogue was missing: they exist,
   * they can log in, but every token they get carries `roles: []`, so the client
   * has no active role and no navigation. A user who deliberately holds some other
   * role is left alone.
   */
  async ensureDefaultRoleFor(userId: string, roleName: string) {
    const count = await this.prisma.userRole.count({ where: { userId } });
    if (count > 0) return;

    this.logger.warn(`User ${userId} had no roles; granting "${roleName}".`);
    await this.assignRole(userId, roleName);
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
      new Set(userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
    );

    return { roles, permissions };
  }
}
