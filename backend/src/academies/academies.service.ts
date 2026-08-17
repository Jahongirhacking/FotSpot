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
import { sanitizeRichText } from '../common/rich-text.util';
import { RedisService } from '../redis/redis.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { TariffsService } from '../tariffs/tariffs.service';
import { academyMediaKey, academyMediaPrefix, assertKeyUnder } from '../storage/storage.keys';
import { SOCIAL_FIELDS, normaliseSocialUrl } from './social-links.util';
import { assertNotLocalTeam } from './academy-kind.util';
import { SquadNotificationsService } from './squad-notifications.service';
import {
  isValidRegionDistrict,
  normaliseDistrict,
  normaliseRegion,
} from '../common/uzbekistan';
import { generatePassword, generateUsername } from './manager-credentials.util';
import {
  AddAcademyPhotoDto,
  SetFeaturedDto,
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

/** How many of each role an academy may feature. A product decision, not a schema one. */
const FEATURED_LIMITS = { PLAYER: 10, COACH: 5, SCOUT: 3 } as const;

@Injectable()
export class AcademiesService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
    private audit: AuditService,
    private storage: StorageService,
    private tariffs: TariffsService,
    private squads: SquadNotificationsService,
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
    // The key never leaves the API — same rule as avatars and clips. The URL is
    // built at read time so changing CDN or provider stays a config change.
    const { logoKey, ...rest } = academy;
    return { ...rest, logoUrl: this.storage.publicUrlOrNull(logoKey) };
  }

  /**
   * The public academy directory.
   *
   * `kind: ACADEMY` alongside the existing status filter, so a local team never
   * appears here however it is verified — the directory is what a parent browses
   * looking for an academy, and a neighbourhood team listed among them would be
   * read as one. The filter is inside the `redis.wrap` callback rather than
   * applied to its result, so the cached value can never contain a local team to
   * begin with (§18): a cache that holds rows it must not serve is one refactor
   * away from serving them.
   */
  async listPublic(region?: string) {
    const rows = await this.redis.wrap(
      RedisKeys.academyList(region),
      CacheTtl.academyList,
      () =>
        this.prisma.academyProfile.findMany({
          where: { kind: 'ACADEMY', status: 'VERIFIED', ...(region ? { region } : {}) },
          orderBy: { createdAt: 'desc' },
        }),
    );

    /*
     * The same swap `getPublicProfile` does, and for the same two reasons.
     *
     * The key is an internal address: callers that hold one start building URLs
     * themselves, which is what stops a CDN change being a config change. This
     * list was handing it out — so the directory both leaked the key and had no
     * `logoUrl` to render, which is why academy cards drew the fallback glyph
     * even for academies that had uploaded a logo.
     *
     * Mapped on read rather than inside the cache, deliberately: what is cached
     * stays provider-agnostic, so changing `R2_PUBLIC_BASE_URL` takes effect on
     * the next read instead of waiting out a TTL of stale absolute URLs.
     */
    return rows.map(({ logoKey, ...rest }) => ({
      ...rest,
      logoUrl: this.storage.publicUrlOrNull(logoKey),
    }));
  }

  /** Admin console: every academy regardless of status, newest first. */
  async listAll() {
    const rows = await this.prisma.academyProfile.findMany({
      include: { members: { where: { role: 'MANAGER' }, select: { userId: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Same swap as the public list: admin-only is not a reason to hand out a
    // storage key, and the console renders the logo from the URL like every
    // other screen.
    return rows.map(({ logoKey, ...rest }) => ({
      ...rest,
      logoUrl: this.storage.publicUrlOrNull(logoKey),
    }));
  }

  async update(userId: string, academyId: string, dto: UpdateAcademyDto, isAdmin = false) {
    // Admins onboard academies (§1.10) and therefore have to be able to correct
    // them; a manager can still edit their own.
    if (!isAdmin) await this.assertManager(userId, academyId);
    // A key made a round trip through the browser, so re-check it addresses this
    // academy's own directory before a row points at it.
    if (dto.logoKey) assertKeyUnder(dto.logoKey, academyMediaPrefix(academyId));

    /*
     * The region/district pair as the row would *end up*.
     *
     * The DTO validator sees only the request, so a PATCH sending one half slips
     * past it — moving an academy stored in `Xiva` to `Namangan viloyati` is two
     * individually-valid values naming a place that does not exist. Canonical
     * spellings come back, so an ASCII apostrophe is stored the way the picker
     * would have stored it rather than splitting the district in search.
     */
    const stored = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { region: true, district: true },
    });
    if (!stored) throw new NotFoundException('Academy not found');

    const nextRegion = dto.region !== undefined ? dto.region : stored.region;
    const nextDistrict = dto.district !== undefined ? dto.district : stored.district;
    if (!isValidRegionDistrict(nextRegion, nextDistrict)) {
      const canonical = normaliseRegion(nextRegion);
      throw new BadRequestException(
        canonical
          ? `"${nextDistrict}" is not a district of ${canonical}`
          : `"${nextRegion}" is not a region of Uzbekistan`,
      );
    }

    const canonicalRegion = normaliseRegion(nextRegion);
    const location: { region?: string | null; district?: string | null } = {};
    if (dto.region !== undefined) location.region = canonicalRegion;
    if (dto.district !== undefined) {
      location.district = canonicalRegion ? normaliseDistrict(canonicalRegion, nextDistrict) : null;
    }

    /*
     * Social links are normalised and host-checked, never stored as typed.
     *
     * These end up in an `href` on a public page, so the platform each one
     * claims to be has to be the platform it goes to — see social-links.util.ts.
     */
    const socials: Record<string, string | null> = {};
    for (const field of SOCIAL_FIELDS) {
      const value = dto[field];
      if (value !== undefined) socials[field] = normaliseSocialUrl(field, value);
    }

    /*
     * An emptied box means "take this number off the profile".
     *
     * The DTO lets `''` through so that clearing is expressible at all; storing
     * it verbatim would leave the profile rendering a `tel:` link to nothing,
     * which looks like a working number until somebody rings it. Null is the
     * absence the read side already checks for.
     */
    const phones: Record<string, string | null> = {};
    for (const field of ['primaryPhone', 'backupPhone'] as const) {
      const value = dto[field];
      if (value !== undefined) phones[field] = value === '' ? null : value;
    }

    const updated = await this.prisma.academyProfile.update({
      where: { id: academyId },
      data: {
        ...dto,
        ...socials,
        ...location,
        ...phones,
        // The one field that carries markup. Cleaned here because this endpoint
        // is reachable without the editor that cleans it on the way in.
        ...(dto.defaultTrialNote !== undefined
          ? { defaultTrialNote: sanitizeRichText(dto.defaultTrialNote) }
          : {}),
      },
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
    // A local team has no coaches at all, so this is refused before the plan
    // check for the same reason the plan check comes before minting: the first
    // answer that is "no" should be the one the manager is given.
    await this.assertIsAcademy(academyId, 'create coaches');
    // Checked before anything is minted: a plan refusal must not leave behind a
    // half-created account with credentials nobody will ever be shown.
    await this.tariffs.assertCanAddCoach(actorId, academyId);

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

      // Taking somebody onto the staff is the endorsement. Making the manager
      // say it twice, on another screen, only produced coaches whose reviews
      // their own academy would not accept.
      await tx.academyEndorsement.upsert({
        where: { academyId_userId_role: { academyId, userId, role: 'COACH' } },
        update: { status: 'ACTIVE', revokedAt: null },
        create: { academyId, userId, role: 'COACH' },
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

    const released = await this.prisma.$transaction(async (tx) => {
      // Expelling withdraws the trust that came with joining. A scout who is no
      // longer staff must not keep addressing recommendations to this academy,
      // and a coach must not keep reviewing for it.
      await tx.academyEndorsement.updateMany({
        where: { academyId, userId: member.userId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      return tx.academyMember.update({
        where: { id: memberId },
        data: { status: 'RELEASED', releasedAt: new Date(), groupId: null },
      });
    });
    await this.invalidate(academyId);
    // After the write, so a rolled-back release cannot leave a manager reading
    // that somebody left a squad they are still in (§17). The actor is skipped
    // inside — a manager who pressed remove does not need telling.
    if (member.role === 'PLAYER') {
      await this.squads.announceLeft(academyId, member.userId, userId);
    }
    await this.audit.record(userId, AuditAction.ACADEMY_MEMBER_RELEASED, { memberId, academyId });
    return released;
  }

  /**
   * A player walking out of a local team of their own accord.
   *
   * ## Only a local team, and this is the whole rule
   *
   * An academy membership is not the player's to end (PLAYER_SQUAD.md §5C): it
   * changes when another academy takes them on or when the academy lets them
   * go, and both of those are somebody else's decision by design. A local team
   * is a different arrangement — people join one for a season and stop turning
   * up — and holding somebody in a neighbourhood squad they have left is a
   * record that is simply wrong.
   *
   * Refused rather than hidden. There is no "leave academy" control anywhere in
   * the UI, and this is what makes that true rather than merely tidy: a player
   * calling this endpoint against their academy gets 403.
   *
   * ## The row goes, rather than becoming history
   *
   * Local team history is explicitly not required (§8), and keeping a RELEASED
   * row would have a second cost: `InvitationsService.invite` treats any
   * non-RELEASED membership as "already here", so the row would sit in the way
   * of the team ever inviting them back. Deleting it makes rejoining the same
   * act as joining.
   */
  async leaveTeam(userId: string, academyId: string) {
    const membership = await this.prisma.academyMember.findUnique({
      where: { academyId_userId: { academyId, userId } },
      select: { id: true, role: true, academy: { select: { kind: true } } },
    });
    if (!membership) throw new NotFoundException('You are not in this squad');

    if (membership.academy.kind !== 'LOCAL_TEAM') {
      throw new ForbiddenException(
        'An academy membership ends when another academy takes you on, or when this one releases you',
      );
    }
    // The manager *is* the team here; letting them delete their own membership
    // would leave a squad nobody can run.
    if (membership.role === 'MANAGER') {
      throw new ForbiddenException('A manager cannot leave their own team');
    }

    await this.prisma.academyMember.delete({ where: { id: membership.id } });
    await this.invalidate(academyId);
    if (membership.role === 'PLAYER') {
      // The actor is the player themselves, so the manager — a different person
      // — is the one who hears about it.
      await this.squads.announceLeft(academyId, userId, userId);
    }
    await this.audit.record(userId, AuditAction.ACADEMY_MEMBER_RELEASED, {
      academyId,
      memberId: membership.id,
      voluntary: true,
    });

    return { left: true };
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

  /**
   * A presigned PUT for the academy's own imagery — logo or a gallery photo.
   *
   * The key is minted server-side from the academy id, never from anything the
   * client sent: a caller who could name its own key could write into another
   * academy's directory, or into a player's.
   */
  async imageUploadUrl(userId: string, academyId: string, filename: string) {
    await this.assertManager(userId, academyId);
    const storageKey = academyMediaKey(academyId, filename);
    return this.storage.createUploadUrl(storageKey);
  }

  /** The gallery, in the order the manager arranged it. */
  async listPhotos(academyId: string) {
    const photos = await this.prisma.academyPhoto.findMany({
      where: { academyId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return photos.map((photo) => ({
      ...photo,
      url: this.storage.publicUrlOrNull(photo.storageKey),
    }));
  }

  async addPhoto(userId: string, academyId: string, dto: AddAcademyPhotoDto) {
    await this.assertManager(userId, academyId);
    assertKeyUnder(dto.storageKey, academyMediaPrefix(academyId));

    // Appended to the end. `sortOrder` is dense only by convention — reordering
    // rewrites it wholesale — so the next slot is simply one past the last.
    const last = await this.prisma.academyPhoto.findFirst({
      where: { academyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const photo = await this.prisma.academyPhoto.create({
      data: {
        academyId,
        storageKey: dto.storageKey,
        caption: dto.caption?.trim() || null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await this.invalidate(academyId);
    return { ...photo, url: this.storage.publicUrlOrNull(photo.storageKey) };
  }

  async removePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.academyPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundException('Photo not found');
    await this.assertManager(userId, photo.academyId);

    await this.prisma.academyPhoto.delete({ where: { id: photoId } });
    await this.invalidate(photo.academyId);
    return { removed: true, id: photoId };
  }

  /** Rewrites the whole order, so dragging and deleting share one code path. */
  async reorderPhotos(userId: string, academyId: string, ids: string[]) {
    await this.assertManager(userId, academyId);

    const owned = await this.prisma.academyPhoto.findMany({
      where: { academyId, id: { in: ids } },
      select: { id: true },
    });
    // Silently reordering somebody else's photo is worse than refusing: the id
    // came from a client and may name a row from another academy entirely.
    if (owned.length !== ids.length) {
      throw new BadRequestException('That list contains a photo from another academy');
    }

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.academyPhoto.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    await this.invalidate(academyId);
    return this.listPhotos(academyId);
  }

  /**
   * The people this academy features, by role, in the order it chose.
   *
   * Joined through the membership so a name and a face come back with each —
   * the wall is read far more often than it is edited, and a list of ids would
   * make every reader do the same second query.
   */
  async listFeatured(academyId: string) {
    const rows = await this.prisma.academyFeatured.findMany({
      where: { academyId },
      orderBy: [{ role: 'asc' }, { rank: 'asc' }],
      include: {
        member: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarKey: true,
                // The public profile a player has, which is a different id from
                // their account — see `profileId` below.
                playerProfile: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      role: row.role,
      rank: row.rank,
      memberId: row.memberId,
      userId: row.member?.user?.id ?? null,
      /**
       * Where this person's profile actually lives, or null if they have none.
       *
       * Without it the client had a `userId` and two routes keyed on other
       * things — `/players/:playerProfileId` and `/scouts/:userId` — so a
       * featured name could not be linked without guessing, and a guess would
       * have produced a page of confident links to 404s.
       *
       * A player is the only case where the two differ: their card is a
       * `PlayerProfile` row, and a member listed as PLAYER who has not built one
       * yet answers null rather than a link to nothing. A scout is reached by
       * their account, and a coach has no public page at all — so both are left
       * for the client to decide, which it does by role.
       */
      profileId: row.member?.user?.playerProfile?.id ?? null,
      firstName: row.member?.user?.firstName ?? null,
      lastName: row.member?.user?.lastName ?? null,
      avatarUrl: this.storage.publicUrlOrNull(row.member?.user?.avatarKey),
    }));
  }

  /**
   * Replaces one role's featured list outright.
   *
   * Whole-list rather than add/remove/move, because "these five, in this order"
   * is the thing the manager decided — and rebuilding makes reordering, removing
   * and adding one operation with one set of rules instead of three.
   *
   * The caps live here rather than in the schema: ten players, five coaches and
   * three scouts is a product decision that may change, and changing it should
   * not be a migration.
   */
  async setFeatured(userId: string, academyId: string, dto: SetFeaturedDto) {
    await this.assertManager(userId, academyId);

    const limit = FEATURED_LIMITS[dto.role];
    const memberIds = [...new Set(dto.memberIds ?? [])];
    if (memberIds.length > limit) {
      throw new BadRequestException(
        `You can feature at most ${limit} ${dto.role.toLowerCase()}s`,
      );
    }

    // Everyone featured must actually be on these books, in that role. Without
    // this a manager could feature a rival's player by pasting a membership id.
    const members = await this.prisma.academyMember.findMany({
      where: { id: { in: memberIds }, academyId, role: dto.role, status: { not: 'RELEASED' } },
      select: { id: true },
    });
    if (members.length !== memberIds.length) {
      throw new BadRequestException('Everyone featured must be an active member in that role');
    }

    await this.prisma.$transaction([
      this.prisma.academyFeatured.deleteMany({ where: { academyId, role: dto.role } }),
      ...memberIds.map((memberId, index) =>
        this.prisma.academyFeatured.create({
          data: { academyId, role: dto.role, memberId, rank: index + 1 },
        }),
      ),
    ]);

    await this.invalidate(academyId);
    return this.listFeatured(academyId);
  }

  /**
   * Refuses one of the academy-only actions for a local team.
   *
   * Reads the kind rather than taking it from the caller: every one of these
   * call sites has an academy id and none of them had a reason to load the row,
   * so passing the kind in would mean each of them fetching it correctly. One
   * indexed lookup by primary key is the cheaper mistake to not make.
   */
  private async assertIsAcademy(academyId: string, action: string) {
    const academy = await this.prisma.academyProfile.findUnique({
      where: { id: academyId },
      select: { kind: true },
    });
    if (!academy) throw new NotFoundException('Academy not found');
    assertNotLocalTeam(academy.kind, action);
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
