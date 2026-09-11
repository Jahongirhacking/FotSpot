import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PlanTier, Prisma } from '@prisma/client';
import { AcademiesService } from '../academies/academies.service';
import { AuditAction } from '../audit/audit.actions';
import { AuditService } from '../audit/audit.service';
import { CoachesService } from '../coaches/coaches.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { pageOf, toSkipTake } from '../common/dto/pagination.dto';
import { generatePassword, generateUsername } from '../academies/manager-credentials.util';
import {
  CreateAdminDto,
  ListAdminChatsDto,
  ListAdminThreadDto,
  SearchUsersDto,
  SendAdminMessageDto,
} from './dto/admin.dto';
import { TariffsService } from '../tariffs/tariffs.service';
import { OWN_MEDIA_WHERE } from '../media/media-visibility.util';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private rbac: RbacService,
    private coachesService: CoachesService,
    private academiesService: AcademiesService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private tariffs: TariffsService,
  ) {}

  // ---- Messages to users ----
  //
  // One-way by design: an admin writes, the user receives it as a notification
  // (in the app, on the socket, and on Telegram if linked) and answers through
  // the channels the product already has — support requests and the contact
  // page. "Chat" on the admin side is these rows grouped by recipient, so an
  // admin can see what was said to whom before writing again.

  /** What a chat row and a thread row carry about the person. */
  private static readonly MESSAGE_USER_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    username: true,
    avatarKey: true,
  } as const;

  async sendMessage(actorId: string, dto: SendAdminMessageDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('A message needs some text');
    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientUserId },
      select: { id: true, isActive: true },
    });
    if (!recipient) throw new NotFoundException('User not found');
    if (recipient.id === actorId) throw new BadRequestException('You cannot message yourself');

    const message = await this.prisma.adminMessage.create({
      data: { senderUserId: actorId, recipientUserId: recipient.id, body },
      include: {
        recipient: { select: AdminService.MESSAGE_USER_SELECT },
        sender: { select: AdminService.MESSAGE_USER_SELECT },
      },
    });
    await this.notifications.notify(
      recipient.id,
      'ADMIN_MESSAGE',
      { message: body, messageId: message.id },
      { userId: actorId, role: 'admin' },
    );
    await this.audit.record(actorId, AuditAction.ADMIN_MESSAGE_SENT, {
      messageId: message.id,
      recipientUserId: recipient.id,
      length: body.length,
    });
    return this.toMessage(message);
  }

  /**
   * The history: one row per person any admin has written to, newest message
   * first, paginated. Shared across admins — the platform is the sender as far
   * as the user is concerned, so a second admin should see what the first said.
   */
  async listChats(dto: ListAdminChatsDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const [rows, distinct] = await Promise.all([
      this.prisma.$queryRaw<{ recipientUserId: string; lastAt: Date; count: number }[]>(
        Prisma.sql`
          SELECT "recipientUserId", MAX("createdAt") AS "lastAt", COUNT(*)::int AS count
          FROM "AdminMessage"
          GROUP BY "recipientUserId"
          ORDER BY MAX("createdAt") DESC
          LIMIT ${take} OFFSET ${skip}`,
      ),
      this.prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(DISTINCT "recipientUserId")::int AS total FROM "AdminMessage"`,
      ),
    ]);
    const ids = rows.map((row) => row.recipientUserId);
    const [users, latest] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: AdminService.MESSAGE_USER_SELECT,
      }),
      Promise.all(
        ids.map((recipientUserId) =>
          this.prisma.adminMessage.findFirst({
            where: { recipientUserId },
            orderBy: { createdAt: 'desc' },
            include: { sender: { select: AdminService.MESSAGE_USER_SELECT } },
          }),
        ),
      ),
    ]);
    const byId = new Map(users.map((user) => [user.id, user]));
    const items = rows.map((row, index) => {
      const user = byId.get(row.recipientUserId);
      const last = latest[index];
      return {
        user: user ? this.toMessageUser(user) : null,
        messageCount: row.count,
        lastAt: row.lastAt,
        lastMessage: last
          ? {
              id: last.id,
              body: last.body,
              createdAt: last.createdAt,
              sender: this.toMessageUser(last.sender),
            }
          : null,
      };
    });
    return pageOf(items, distinct[0]?.total ?? 0, { page, pageSize });
  }

  /** Everything written to one person, newest first. */
  async listThread(recipientUserId: string, dto: ListAdminThreadDto = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
      select: AdminService.MESSAGE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const [rows, total] = await Promise.all([
      this.prisma.adminMessage.findMany({
        where: { recipientUserId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          sender: { select: AdminService.MESSAGE_USER_SELECT },
          recipient: { select: AdminService.MESSAGE_USER_SELECT },
        },
      }),
      this.prisma.adminMessage.count({ where: { recipientUserId } }),
    ]);
    return {
      user: this.toMessageUser(user),
      ...pageOf(
        rows.map((row) => this.toMessage(row)),
        total,
        { page, pageSize },
      ),
    };
  }

  private toMessageUser(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatarKey: string | null;
  }) {
    const { avatarKey, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(avatarKey) };
  }

  private toMessage(row: {
    id: string;
    body: string;
    createdAt: Date;
    sender: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      avatarKey: string | null;
    };
    recipient: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      username: string | null;
      avatarKey: string | null;
    };
  }) {
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      sender: this.toMessageUser(row.sender),
      recipient: this.toMessageUser(row.recipient),
    };
  }

  // ---- Admin (1.2: Verify coaches, Verify academies, Moderate) ----
  // `actorId` is threaded down so the audit row names the admin who acted (1.21),
  // not just the fact that something was verified.

  async verifyCoach(actorId: string, coachProfileId: string, approve: boolean) {
    const result = await this.coachesService.verify(coachProfileId, approve, actorId);
    await this.notifications.notify(
      result.userId,
      'VERIFICATION_RESULT',
      { subject: 'coach', approved: approve },
      { userId: actorId, role: 'admin' },
    );
    return result;
  }

  async verifyAcademy(actorId: string, academyId: string, approve: boolean) {
    const result = await this.academiesService.verify(academyId, approve, actorId);
    const manager = await this.prisma.academyMember.findFirst({
      where: { academyId, role: 'MANAGER' },
    });
    if (manager) {
      await this.notifications.notify(
        manager.userId,
        'VERIFICATION_RESULT',
        { subject: 'academy', approved: approve },
        { userId: actorId, role: 'admin' },
      );
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
  async searchUsers(dto: SearchUsersDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const term = (dto.query ?? '').trim();
    const where: Prisma.UserWhereInput = term
      ? {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term } },
            // An admin-created academy manager has no email and may have no
            // phone — the username is the only handle that account can be
            // found by, so omitting it makes those accounts unsearchable.
            { username: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          avatarKey: true,
          createdAt: true,
          planTier: true,
          roles: { select: { role: { select: { name: true } } } },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return pageOf(
      items.map(({ roles, ...user }) => ({
        ...this.storage.withAvatarUrl(user),
        roles: roles.map((entry) => entry.role.name),
      })),
      total,
      { page, pageSize },
    );
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
        // These accounts are minted with a username and no email, so without it
        // the list would identify a freshly created admin by nothing at all.
        username: true,
        avatarKey: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return admins.map(({ roles, ...user }) => ({
      ...this.storage.withAvatarUrl(user),
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
        username: true,
        avatarKey: true,
        isActive: true,
        createdAt: true,
        planTier: true,
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
            /*
             * Clips that still exist — the same filter, and the same reason, as
             * the player's own profile card (`UsersService.findMeWithStats`).
             *
             * A soft-deleted clip keeps its row, so an unfiltered count told an
             * admin a player had three clips when all three had been deleted.
             * That is worse here than on the player's own screen: this is the
             * view someone acts on.
             */
            _count: {
              select: {
                media: { where: OWN_MEDIA_WHERE },
                trialApplications: true,
                recommendations: true,
              },
            },
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
    const { roles, ...rest } = this.storage.withAvatarUrl(user);

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
  /**
   * Erases an account, for a deletion request that has been acted on.
   *
   * ## Why this exists at all
   *
   * The privacy policy says an account can be removed. Without this, that
   * sentence was a promise the code could not keep — and a policy describing a
   * more generous product than the one shipped is the worst kind of untrue,
   * because people read it before deciding what to expose about a child.
   *
   * ## Why only a super admin, and never to oneself
   *
   * It is irreversible and it cascades: the player card, every clip, every
   * recommendation and assessment about them goes. That is the point — a partial
   * deletion is not a deletion — but it also means a mistake cannot be undone, so
   * it sits with the smallest possible group. A super admin cannot be deleted at
   * all, for the same reason one cannot be disabled: it is the account that fixes
   * everything else.
   *
   * ## Objects first, row second
   *
   * The stored keys live on rows the cascade is about to remove, so they are read
   * and deleted before the row goes. Get that order wrong and the database
   * forgets where the video was while the video stays in the bucket — the exact
   * outcome someone asking to be erased was trying to avoid. A failed object
   * delete is logged and does not stop the erasure: leaving the account behind
   * because one file would not delete serves nobody.
   */
  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        avatarKey: true,
        roles: { select: { role: { select: { name: true } } } },
        playerProfile: { select: { media: { select: { storageKey: true, posterKey: true } } } },
      },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.roles.some((entry) => entry.role.name === 'super_admin')) {
      throw new ForbiddenException('A super admin account cannot be deleted');
    }

    const keys = [
      target.avatarKey,
      ...(target.playerProfile?.media ?? []).flatMap((clip) => [clip.storageKey, clip.posterKey]),
    ].filter((key): key is string => Boolean(key));

    for (const key of keys) {
      await this.storage.deleteObject(key).catch((error: Error) => {
        this.logger.warn(
          `Deleting user ${userId}: could not remove "${key}" (${error.message}). The account is ` +
            'still being erased; this object is orphaned in the bucket.',
        );
      });
    }

    // Recorded before the row goes, and deliberately without the address: the
    // audit trail has to outlive the account, and re-storing the email of
    // somebody who asked to be erased would defeat the erasure.
    await this.audit.record(actorId, AuditAction.USER_DELETED, {
      userId,
      objectsRemoved: keys.length,
    });

    await this.prisma.user.delete({ where: { id: userId } });
    return { deleted: true, objectsRemoved: keys.length };
  }

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

    await this.audit.record(
      actorId,
      isActive ? AuditAction.USER_ENABLED : AuditAction.USER_DISABLED,
      {
        userId,
      },
    );

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
      // `removeRole` deletes a row, so revoking a role the user never had throws
      // P2025. That case is genuinely idempotent and must not fail the request —
      // but a blanket catch also swallowed real database errors and then wrote an
      // audit entry saying the role had been removed. An audit trail that records
      // something that did not happen is worse than no audit trail, so only the
      // not-found case is absorbed and anything else propagates.
      try {
        await this.rbac.removeRole(userId, roleName);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
          throw error;
        }
        this.logger.debug(`Role ${roleName} was already absent from user ${userId}`);
      }
      await this.audit.record(actorId, AuditAction.ROLE_REMOVED, { userId, roleName });
    }

    return this.rbac.getEffectiveAccess(userId);
  }

  /**
   * Move an account onto another tariff — **super admin only**.
   *
   * A thin pass-through to `TariffsService`, which owns the audit entry and the
   * "user not found" answer. It is exposed here because the screen that changes
   * a plan is the same one that grants roles and disables accounts, and a caller
   * should not have to know that plans live in a different module.
   */
  async setUserPlan(actorId: string, userId: string, tier: PlanTier) {
    return this.tariffs.setUserPlan(actorId, userId, tier);
  }

  async listAuditLogs(take = 100) {
    return this.audit.listRecent(take);
  }

  // ---- Super Admin only (1.2: CRUD Admins/Roles/Permissions, Feature Flags) ----
  // Admin itself is explicitly barred from creating admins (1.2 restriction);
  // these methods are only reachable via the super_admin-gated controller routes.

  /**
   * Creates an admin account and hands back its one-time credentials.
   *
   * ## Created, not promoted
   *
   * Admins are staff, not users who happen to be on the platform already, so this
   * mints the account rather than granting a role to one somebody searched for —
   * see CreateAdminDto for why the search box was the wrong shape entirely.
   *
   * The mechanism is deliberately the same one that onboards an academy manager
   * (§1.10, `AcademiesService.createManagerAccount`): a generated username, a
   * generated password, and `mustChangePassword` set, because the password
   * necessarily passes through a third party — the super admin, and whatever chat
   * app they paste it into. It is hashed before the row is written and the
   * plaintext is returned up the stack exactly once, so "resend their password" is
   * impossible by construction rather than by policy.
   *
   * One transaction: an account created without its `admin` role is a person who
   * can sign in and see nothing, and a role row pointing at no account is worse.
   */
  async createAdmin(actorId: string, dto: CreateAdminDto) {
    if (dto.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (taken) {
        throw new ConflictException('That phone number already belongs to an account');
      }
    }

    const password = generatePassword();
    const passwordHash = await argon2.hash(password);
    const fullName = `${dto.firstName} ${dto.lastName}`;

    const created = await this.prisma.$transaction(async (tx) => {
      // A username collision is a coincidence, not a conflict to surface: two
      // admins sharing a name is perfectly ordinary, so retry rather than fail.
      for (let attempt = 0; attempt < 5; attempt++) {
        const username = generateUsername(fullName, 'admin');
        if (await tx.user.findUnique({ where: { username } })) continue;

        const user = await tx.user.create({
          data: {
            username,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone ?? null,
            mustChangePassword: true,
          },
        });

        await this.rbac.assignRole(user.id, 'admin', tx);
        return { user, username };
      }

      throw new BadRequestException('Could not generate a unique username — try a different name');
    });

    await this.audit.record(actorId, AuditAction.ADMIN_CREATED, {
      userId: created.user.id,
      username: created.username,
    });

    return {
      userId: created.user.id,
      // Shown once and never again — only the Argon2 hash is stored.
      credentials: { username: created.username, password },
    };
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
