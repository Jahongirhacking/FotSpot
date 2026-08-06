import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AcademyMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { generatePassword, generateUsername } from './manager-credentials.util';
import {
  CreateCoachDto,
  ImportMemberDto,
  ListMembersDto,
  UpdateMemberDto,
  CreateAcademyDto,
  NewManagerDto,
  SetManagerDto,
  UpdateAcademyDto,
} from './dto/academy.dto';

/** Returned exactly once, at creation. Only the password's hash is stored. */
export interface ManagerCredentials {
  username: string;
  password: string;
}

@Injectable()
export class AcademiesService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
    private audit: AuditService,
    private storage: StorageService,
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
   *
   * The manager can be an existing account (`managerUserId`) or one the platform
   * mints (`newManager`). The second path exists because most academy directors
   * here are not already users, and telling a fifty-year-old director to go
   * self-register before the platform will talk to them loses the academy.
   *
   * Returns `credentials` only when an account was created — the generated password
   * is shown once and is unrecoverable afterwards.
   */
  async register(actorId: string, dto: CreateAcademyDto) {
    const { managerUserId, newManager, ...profile } = dto;
    this.assertOneManagerSource(managerUserId, newManager);

    if (managerUserId) await this.assertAssignable(managerUserId);

    let credentials: ManagerCredentials | null = null;

    const academy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.academyProfile.create({
        data: { ...profile, status: 'VERIFIED' },
      });

      let userId = managerUserId;
      if (newManager) {
        const minted = await this.createManagerAccount(tx, newManager, created.name);
        userId = minted.userId;
        credentials = minted.credentials;
      }

      if (userId) await this.attachManager(tx, created.id, userId);
      return created;
    });

    await this.invalidate(academy.id, academy.region);
    await this.audit.record(actorId, AuditAction.ACADEMY_VERIFIED, {
      academyId: academy.id,
      createdByAdmin: true,
      managerUserId: managerUserId ?? null,
      managerAccountCreated: Boolean(newManager),
    });

    return { ...academy, credentials };
  }

  /**
   * Assigns or replaces the academy's single manager. Admin-only.
   *
   * "One academy, one manager" is enforced here rather than by a database
   * constraint because replacing a manager is a *transfer*, not an insert: the
   * outgoing manager has to lose access in the same transaction that the incoming
   * one gains it, or there is a window in which two accounts control the same
   * academy's recommendation inbox.
   */
  async setManager(actorId: string, academyId: string, dto: SetManagerDto) {
    const { managerUserId, newManager } = dto;
    this.assertOneManagerSource(managerUserId, newManager);
    if (!managerUserId && !newManager) {
      throw new BadRequestException('Name a manager: pick an existing user or create an account');
    }

    const academy = await this.prisma.academyProfile.findUnique({ where: { id: academyId } });
    if (!academy) throw new NotFoundException('Academy not found');
    if (managerUserId) await this.assertAssignable(managerUserId);

    let credentials: ManagerCredentials | null = null;

    const member = await this.prisma.$transaction(async (tx) => {
      let userId = managerUserId;
      if (newManager) {
        const minted = await this.createManagerAccount(tx, newManager, academy.name);
        userId = minted.userId;
        credentials = minted.credentials;
      }

      const outgoing = await tx.academyMember.findFirst({
        where: { academyId, role: 'MANAGER' },
      });

      if (outgoing && outgoing.userId !== userId) {
        await tx.academyMember.delete({ where: { id: outgoing.id } });
        await this.revokeManagerRoleIfUnused(tx, outgoing.userId);
      }

      return this.attachManager(tx, academyId, userId!);
    });

    await this.invalidate(academyId, academy.region);
    await this.audit.record(actorId, AuditAction.ACADEMY_MANAGER_CHANGED, {
      academyId,
      managerUserId: member.userId,
      managerAccountCreated: Boolean(newManager),
    });

    return { member, credentials };
  }

  /**
   * Issues a fresh one-time password for the current manager. Admin-only.
   *
   * The necessary counterpart to generating an unrecoverable password: without
   * this, a manager who loses their password has no route back in, and the
   * workaround an admin would otherwise invent is a second account for the same
   * person — which quietly breaks "one academy, one manager".
   *
   * Only works on accounts the platform created (they have a username). An account
   * someone registered themselves belongs to them, not to the admin, and resets
   * for it go through the normal self-service path.
   */
  async resetManagerPassword(actorId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { academyId, role: 'MANAGER' },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('This academy has no manager yet');
    if (!membership.user.username) {
      throw new BadRequestException(
        'This manager signs in with their own email or phone — they reset their own password',
      );
    }

    const password = generatePassword();
    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { passwordHash: await argon2.hash(password), mustChangePassword: true },
    });

    await this.audit.record(actorId, AuditAction.MANAGER_PASSWORD_RESET, {
      academyId,
      managerUserId: membership.userId,
    });

    return { username: membership.user.username, password };
  }

  /**
   * What the caller is to this academy, if anything.
   *
   * A separate endpoint rather than a field on `GET /academies/:id`, because that
   * response is public and Redis-cached: folding a per-viewer answer into a shared
   * cache entry would serve one user's relationship to the next visitor. The cost
   * is a second request on a page that is already authenticated.
   *
   * Only one relation is returned — the strongest — since the badge has room for
   * one and "Manager" already implies belonging.
   */
  async relationTo(userId: string, academyId: string) {
    const [membership, endorsement, acceptedTrial] = await Promise.all([
      this.prisma.academyMember.findUnique({
        where: { academyId_userId: { academyId, userId } },
      }),
      this.prisma.academyEndorsement.findFirst({
        where: { academyId, userId, status: 'ACTIVE' },
      }),
      // The only player↔academy link the MVP has. Squad membership and academy
      // history are Phase 2 (README §3–8) and deliberately not built, so a player
      // "belongs" to the academy that accepted them at a trial and nothing else.
      this.prisma.trialApplication.findFirst({
        where: { status: 'ACCEPTED', trial: { academyId }, player: { userId } },
      }),
    ]);

    if (membership) return { relation: membership.role };
    if (endorsement) return { relation: `ENDORSED_${endorsement.role}` };
    if (acceptedTrial) return { relation: 'TRIALIST' };
    return { relation: null };
  }

  /**
   * The academy this user manages, or null.
   *
   * The academy-manager home used to find its academy by scanning the public list
   * and taking the first entry, which showed managers somebody else's academy.
   */
  /**
   * "My academy" — the one this account belongs to, whatever their part in it.
   *
   * A manager's academy first, since a manager runs exactly one and that is
   * unambiguously theirs; otherwise the active membership they hold as coach,
   * scout or player. A coach asking for "my academy" means the one they work at,
   * and answering `null` because they do not manage it is a distinction only the
   * database cares about.
   */
  async findMine(userId: string) {
    const membership = await this.prisma.academyMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      // MANAGER before COACH before PLAYER before SCOUT, alphabetically by luck
      // rather than design — so the ordering is spelled out instead.
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      include: { academy: true },
    });

    const manager = await this.prisma.academyMember.findFirst({
      where: { userId, role: 'MANAGER' },
      include: { academy: true },
    });

    return (manager ?? membership)?.academy ?? null;
  }

  /** The two ways to name a manager are alternatives, not a merge. */
  private assertOneManagerSource(managerUserId?: string, newManager?: NewManagerDto) {
    if (managerUserId && newManager) {
      throw new BadRequestException('Choose one: an existing user, or a new account — not both');
    }
  }

  /** An academy has exactly one manager, so this upserts rather than inserts. */
  private async attachManager(tx: Prisma.TransactionClient, academyId: string, userId: string) {
    const member = await tx.academyMember.upsert({
      where: { academyId_userId: { academyId, userId } },
      update: { role: 'MANAGER' },
      create: { academyId, userId, role: 'MANAGER' },
    });
    await this.rbac.assignRole(userId, 'academy_manager', tx);
    return member;
  }

  /**
   * Creates the manager's account with a generated username and one-time password.
   *
   * The password is hashed before the row is written and the plaintext is returned
   * up the stack exactly once, so "resend their password" is impossible by
   * construction rather than by policy — the only recovery is a reset.
   */
  private async createManagerAccount(
    tx: Prisma.TransactionClient,
    manager: NewManagerDto,
    academyName: string,
  ): Promise<{ userId: string; credentials: ManagerCredentials }> {
    if (manager.phone) {
      const taken = await tx.user.findUnique({ where: { phone: manager.phone } });
      if (taken) {
        throw new BadRequestException(
          'That phone number already belongs to an account — select it as an existing user instead',
        );
      }
    }

    const password = generatePassword();
    const passwordHash = await argon2.hash(password);

    // A username collision is a coincidence, not a conflict to surface: two
    // academies sharing a name is expected, so retry rather than fail the admin.
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = generateUsername(academyName);
      const clash = await tx.user.findUnique({ where: { username } });
      if (clash) continue;

      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          firstName: manager.firstName,
          lastName: manager.lastName,
          phone: manager.phone ?? null,
          mustChangePassword: true,
        },
      });

      return { userId: user.id, credentials: { username, password } };
    }

    throw new BadRequestException('Could not generate a unique username — try a different name');
  }

  /**
   * Managing no academy means the role grants nothing, so it is dropped on
   * hand-over. Left in place it would accumulate on every past manager, and a
   * `academy_manager` claim in a JWT is what the UI keys role switching off.
   */
  private async revokeManagerRoleIfUnused(tx: Prisma.TransactionClient, userId: string) {
    const stillManaging = await tx.academyMember.count({ where: { userId, role: 'MANAGER' } });
    if (stillManaging > 0) return;

    await tx.userRole.deleteMany({
      where: { userId, role: { name: 'academy_manager' } },
    });
  }

  /** A manager must exist, be usable, and not be a child's account. */
  private async assertAssignable(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('That account does not exist');
    if (!user.isActive) throw new BadRequestException('That account is disabled');
    await this.assertNotPlayer(userId);
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
        'A player account cannot be academy staff. Use a separate account for staff roles.',
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

  /**
   * The academy's people: coaches, scouts and the squad.
   *
   * Players are sorted by the rating their coaches have given them — the only
   * ordering a manager asked for, and the only one the platform can defend.
   * "Rating" here is the mean of the eight attributes across every assessment on
   * record, so a player nobody has assessed sorts last rather than sorting as
   * zero-out-of-a-hundred, which would read as a judgement rather than a gap.
   *
   * Two queries regardless of squad size: the members, then their assessments
   * grouped in the database. A rating fetched per member would be an N+1 on the
   * screen a manager opens most.
   */

  /**
   * Add a coach — an existing account, or a new one minted for them.
   *
   * The two paths mirror appointing a manager (§1.10) and exist for the same
   * reason: most youth coaches in Uzbekistan have no FotSpot account until an
   * academy makes them one, and telling a manager "ask them to register first,
   * then come back and search for them" is how a feature goes unused.
   *
   * ## The academy's word is the verification
   *
   * A coach added this way is VERIFIED on arrival rather than PENDING. The
   * platform's question about a coach is "does an academy stand behind them",
   * and an academy putting them on its own books *is* that answer — leaving them
   * pending would mean an admin re-confirming a fact the academy already
   * asserted, while the coach cannot assess anyone in the meantime.
   *
   * A coach who already has a profile keeps whatever status they had: an academy
   * hiring someone does not get to upgrade a judgement made elsewhere.
   *
   * Credentials for a minted account are returned exactly once, like a manager's.
   */
  async createCoach(actorId: string, academyId: string, dto: CreateCoachDto) {
    await this.assertManager(actorId, academyId);

    if (!dto.userId === !dto.newCoach) {
      throw new BadRequestException('Give either an existing user or the details for a new one');
    }

    const academy = await this.prisma.academyProfile.findUnique({ where: { id: academyId } });
    if (!academy) throw new NotFoundException('Academy not found');

    if (dto.userId) await this.assertAssignable(dto.userId);

    const result = await this.prisma.$transaction(async (tx) => {
      let credentials: ManagerCredentials | undefined;
      let userId = dto.userId;

      if (!userId) {
        const created = await this.createManagerAccount(tx, dto.newCoach!, academy.name);
        userId = created.userId;
        credentials = created.credentials;
      }

      const existingMember = await tx.academyMember.findUnique({
        where: { academyId_userId: { academyId, userId } },
      });
      if (existingMember && existingMember.status !== 'RELEASED') {
        throw new ConflictException('They are already on your books');
      }

      const coach = await tx.coachProfile.upsert({
        where: { userId },
        // An existing coach keeps their status; a new one is verified by the act
        // of an academy adding them.
        update: { ...(dto.bio !== undefined ? { bio: dto.bio } : {}) },
        create: { userId, bio: dto.bio ?? null, status: 'VERIFIED' },
      });

      await tx.userRole.createMany({
        data: [{ userId, roleId: await this.roleId(tx, 'coach') }],
        skipDuplicates: true,
      });

      const member = await tx.academyMember.upsert({
        where: { academyId_userId: { academyId, userId } },
        update: { role: 'COACH', status: 'ACTIVE', coachId: coach.id, releasedAt: null },
        create: { academyId, userId, role: 'COACH', coachId: coach.id },
      });

      return { member, coachId: coach.id, credentials };
    });

    await this.invalidate(academyId);
    await this.audit.record(actorId, AuditAction.ACADEMY_COACH_ADDED, {
      academyId,
      coachId: result.coachId,
      minted: !!result.credentials,
    });
    return result;
  }

  /** Role rows are seeded, so a missing one is a broken deployment, not input. */
  private async roleId(tx: Prisma.TransactionClient, name: string) {
    const role = await tx.role.findUnique({ where: { name } });
    if (!role) throw new BadRequestException(`Role ${name} is missing from this deployment`);
    return role.id;
  }

  async listMembers(academyId: string, dto: ListMembersDto = {}) {
    const members = await this.prisma.academyMember.findMany({
      where: {
        academyId,
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        releasedAt: true,
        previousAcademyId: true,
        coachType: true,
        group: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            avatarKey: true,
            playerProfile: { select: { id: true, primaryPosition: true, birthDate: true } },
            coachProfile: { select: { id: true, status: true } },
          },
        },
      },
    });

    const playerIds = members
      .map((member) => member.user.playerProfile?.id)
      .filter((id): id is string => !!id);
    const ratings = await this.ratingsFor(playerIds);

    // A scout's standing is what the scouts tab shows instead of a rating, and
    // ScoutStats is keyed by userId without a relation — one query for the page.
    const stats = await this.prisma.scoutStats.findMany({
      where: { userId: { in: members.map((member) => member.user.id) } },
      select: { userId: true, level: true, successRate: true },
    });
    const standing = new Map(stats.map((row) => [row.userId, row]));

    return members
      .map(({ user, ...member }) => ({
        ...member,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        avatarUrl: this.storage.publicUrlOrNull(user.avatarKey),
        playerId: user.playerProfile?.id ?? null,
        primaryPosition: user.playerProfile?.primaryPosition ?? null,
        birthDate: user.playerProfile?.birthDate ?? null,
        coachStatus: user.coachProfile?.status ?? null,
        rating: user.playerProfile ? (ratings.get(user.playerProfile.id) ?? null) : null,
        level: standing.get(user.id)?.level ?? null,
        successRate: standing.get(user.id)?.successRate ?? null,
      }))
      .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }

  /** Mean assessed attribute score per player, in one grouped query. */
  private async ratingsFor(playerIds: string[]) {
    const ratings = new Map<string, number>();
    if (playerIds.length === 0) return ratings;

    const rows = await this.prisma.coachAssessment.groupBy({
      by: ['playerId'],
      where: { playerId: { in: playerIds } },
      _avg: {
        speed: true,
        passing: true,
        vision: true,
        dribbling: true,
        finishing: true,
        physical: true,
        leadership: true,
        discipline: true,
      },
    });

    for (const row of rows) {
      const values = Object.values(row._avg).filter((value): value is number => value !== null);
      if (values.length) {
        ratings.set(row.playerId, values.reduce((sum, value) => sum + value, 0) / values.length);
      }
    }
    return ratings;
  }

  /**
   * Edit a membership, or stand it down.
   *
   * `INACTIVE` is the closest thing to a delete this offers, deliberately: a
   * coach's assessments are evidence other people's decisions were built on, and
   * removing the row would strand them.
   */
  async updateMember(userId: string, academyId: string, memberId: string, dto: UpdateMemberDto) {
    await this.assertManager(userId, academyId);
    const member = await this.prisma.academyMember.findUnique({ where: { id: memberId } });
    if (!member || member.academyId !== academyId) throw new NotFoundException('Member not found');
    // The manager runs the academy; demoting or standing themselves down would
    // leave it with nobody who can act.
    if (member.role === 'MANAGER') {
      throw new BadRequestException('Change the manager from the academy settings');
    }

    const updated = await this.prisma.academyMember.update({
      where: { id: memberId },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.status ? { status: dto.status, releasedAt: null } : {}),
        ...(dto.coachType !== undefined ? { coachType: dto.coachType.trim() || null } : {}),
      },
    });
    await this.invalidate(academyId);
    await this.audit.record(userId, AuditAction.ACADEMY_MEMBER_UPDATED, { memberId, ...dto });
    return updated;
  }

  /**
   * Release a member so another academy can take them on.
   *
   * A transfer is two consented halves: this academy lets go, and a receiving
   * academy imports. Modelling it as one atomic "move to academy B" would let one
   * manager put people on another academy's books without asking, which is how a
   * transfer market becomes a way to dump a player on a rival.
   *
   * The membership stays on this academy's record as RELEASED until someone
   * imports it, so the history of who was here is never rewritten.
   */
  async releaseMember(userId: string, academyId: string, memberId: string) {
    await this.assertManager(userId, academyId);
    const member = await this.prisma.academyMember.findUnique({ where: { id: memberId } });
    if (!member || member.academyId !== academyId) throw new NotFoundException('Member not found');
    if (member.role === 'MANAGER') throw new BadRequestException('A manager cannot be released');

    const released = await this.prisma.academyMember.update({
      where: { id: memberId },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
    await this.invalidate(academyId);
    await this.audit.record(userId, AuditAction.ACADEMY_MEMBER_RELEASED, { memberId, academyId });
    return released;
  }

  /** Everyone any academy has released — the transfer list. */
  async listTransferMarket(role?: AcademyMemberRole) {
    const members = await this.prisma.academyMember.findMany({
      where: { status: 'RELEASED', ...(role ? { role } : {}) },
      orderBy: { releasedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        role: true,
        releasedAt: true,
        academy: { select: { id: true, name: true, region: true } },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            avatarKey: true,
            playerProfile: { select: { id: true, primaryPosition: true, birthDate: true } },
          },
        },
      },
    });

    const ratings = await this.ratingsFor(
      members.map((m) => m.user.playerProfile?.id).filter((id): id is string => !!id),
    );

    return members.map(({ user, ...member }) => ({
      ...member,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      avatarUrl: this.storage.publicUrlOrNull(user.avatarKey),
      playerId: user.playerProfile?.id ?? null,
      primaryPosition: user.playerProfile?.primaryPosition ?? null,
      rating: user.playerProfile ? (ratings.get(user.playerProfile.id) ?? null) : null,
    }));
  }

  /**
   * Take on someone another academy released.
   *
   * The row moves rather than being copied, carrying `previousAcademyId`, so the
   * question "where did this coach come from" has an answer in the data instead
   * of only in an audit log.
   */
  async importMember(userId: string, academyId: string, dto: ImportMemberDto) {
    await this.assertManager(userId, academyId);

    const member = await this.prisma.academyMember.findUnique({ where: { id: dto.memberId } });
    if (!member || member.status !== 'RELEASED') {
      throw new NotFoundException('That transfer is no longer available');
    }
    if (member.academyId === academyId) {
      throw new BadRequestException('They are already yours — reactivate them instead');
    }

    const existing = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId: member.userId } },
    });
    if (existing) throw new ConflictException('They are already on your books');

    const imported = await this.prisma.academyMember.update({
      where: { id: member.id },
      data: {
        academyId,
        status: 'ACTIVE',
        releasedAt: null,
        previousAcademyId: member.academyId,
        joinedAt: new Date(),
      },
    });

    await this.invalidate(academyId);
    await this.invalidate(member.academyId);
    await this.audit.record(userId, AuditAction.ACADEMY_MEMBER_IMPORTED, {
      memberId: member.id,
      from: member.academyId,
      to: academyId,
    });
    return imported;
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
