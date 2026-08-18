import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { isValidRegionDistrict, normaliseDistrict, normaliseRegion } from '../common/uzbekistan';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { normaliseUsername } from '../users/username.util';
import { computeCardStars } from './card-stars.util';
import {
  CreatePlayerProfileDto,
  SearchPlayersDto,
  UpdatePlayerProfileDto,
  UpdatePlayerStatsDto,
} from './dto/player.dto';
import { PUBLIC_MEDIA_WHERE } from '../media/media-visibility.util';

/**
 * The player's photo lives on `User`, not `PlayerProfile` — one account, one
 * picture, whether it is showing on a player card or in the admin console.
 *
 * Every profile response flattens it to a top-level `avatarUrl` so no caller has to
 * know that, and so the card component takes one shape rather than two. The URL is
 * built from the stored key at read time — see StorageService.
 */
const AVATAR_INCLUDE = { user: { select: { avatarKey: true, username: true } } } as const;

/** Bounds on an editable date of birth — a plausible playing age, not any date. */
const MIN_PLAYER_AGE = 5;
const MAX_PLAYER_AGE = 45;

/** Whole years, counting the birthday itself. */
function ageOn(birthDate: Date, now = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const month = now.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  /**
   * The star row for a set of players, in two queries however many there are.
   *
   * Computed here rather than in the client because every surface that draws a
   * card was otherwise fetching each player's assessments to recompute the same
   * five stars — a request per card on a screen that shows twenty.
   */
  private async starsFor(playerIds: string[]): Promise<Map<string, number>> {
    const stars = new Map<string, number>();
    if (playerIds.length === 0) return stars;

    const [clips, assessments] = await Promise.all([
      this.prisma.media.findMany({
        // The stars are a public summary of a player's evidence, so they count
        // only evidence that is public. A self-reported 90 on a clip nobody has
        // reviewed would otherwise raise a card in search results — moderation
        // that stops at the video and not at what the video claims is not
        // moderation.
        where: { playerId: { in: playerIds }, ...PUBLIC_MEDIA_WHERE, rating: { not: null } },
        select: { playerId: true, category: true, rating: true, reportedBy: true, createdAt: true },
      }),
      this.prisma.coachAssessment.findMany({
        where: { playerId: { in: playerIds } },
        orderBy: { createdAt: 'desc' },
        // The util only reads the newest per attribute; a player with years of
        // history does not need all of it shipped into memory.
        take: playerIds.length * 20,
      }),
    ]);

    const clipsBy = new Map<string, typeof clips>();
    for (const clip of clips) {
      const list = clipsBy.get(clip.playerId) ?? [];
      list.push(clip);
      clipsBy.set(clip.playerId, list);
    }

    const assessedBy = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const list = assessedBy.get(assessment.playerId) ?? [];
      list.push(assessment);
      assessedBy.set(assessment.playerId, list);
    }

    for (const playerId of playerIds) {
      stars.set(
        playerId,
        computeCardStars(clipsBy.get(playerId) ?? [], assessedBy.get(playerId) ?? []),
      );
    }
    return stars;
  }

  private withAvatar<
    T extends { user?: { avatarKey: string | null; username?: string | null } | null },
  >(profile: T) {
    const { user, ...rest } = profile;
    return {
      ...rest,
      avatarUrl: this.storage.publicUrlOrNull(user?.avatarKey),
      // The handle rides along so a card can link to /players/@handle without a
      // second lookup, and so the profile can show it.
      username: user?.username ?? null,
    };
  }

  /**
   * Resolves `/players/@handle`.
   *
   * A separate route rather than letting `:id` accept both: a handle and a UUID
   * are different keys, and a lookup that guesses which one it was handed is a
   * lookup that will one day guess wrong.
   */
  async getByUsername(rawUsername: string) {
    const username = normaliseUsername(rawUsername);
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { playerProfile: { select: { id: true } } },
    });
    if (!user?.playerProfile) throw new NotFoundException('Player not found');
    return this.getPublicProfile(user.playerProfile.id);
  }

  /**
   * Creates the player card, and adopts the name onto the account if it has none.
   *
   * ## One name, asked once
   *
   * The account carries the name (`User.firstName`/`lastName`); the card carries
   * its own copy because a card is a football record and can outlive a rename.
   * The wizard therefore only asks when the account has no name yet — and when
   * it does ask, that answer is the *account's* name from then on, not a value
   * that lives on the card alone.
   *
   * Without this the two drifted in the one case that matters: somebody who
   * signed up by phone has no name, types it into the card, and still shows up
   * as a blank account everywhere else in the product — the avatar menu, the
   * squad list, the notification that says who accepted.
   *
   * Only ever fills a blank. A user who already has a name keeps it: the wizard
   * shows it read-only rather than asking, and renaming belongs on the profile
   * screen where it is one deliberate act instead of a side effect of building
   * a card.
   */
  async createProfile(userId: string, dto: CreatePlayerProfileDto) {
    const existing = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Player profile already exists');

    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    const adopt: { firstName?: string; lastName?: string } = {};
    if (!account?.firstName?.trim() && dto.firstName.trim()) adopt.firstName = dto.firstName.trim();
    if (!account?.lastName?.trim() && dto.lastName.trim()) adopt.lastName = dto.lastName.trim();

    // Player is an "additional role" per README 1.2, granted on profile creation.
    // Both halves commit together: a profile without the role leaves the user
    // unable to apply for trials, and a retry hits "profile already exists".
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.playerProfile.create({
        data: { userId, ...dto, birthDate: new Date(dto.birthDate) },
      });
      if (Object.keys(adopt).length > 0) {
        await tx.user.update({ where: { id: userId }, data: adopt });
      }
      await this.rbac.assignRole(userId, 'player', tx);
      return profile;
    });
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: AVATAR_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Player profile not found');
    const stars = await this.starsFor([profile.id]);
    const memberships = await this.membershipsFor(userId);
    return { ...this.withAvatar(profile), stars: stars.get(profile.id) ?? 0, memberships };
  }

  /**
   * Whether this viewer works for an academy, and may therefore read a hidden
   * profile.
   *
   * The private switch exists so a fourteen-year-old is not in a public
   * directory — not to hide them from the people whose job is to look at
   * players. A manager receives them in an inbox and a coach is handed them to
   * judge; neither can do that against a 404.
   *
   * Checked against membership rather than the JWT's role list: the claims are a
   * snapshot taken at login (backend/CLAUDE.md §7) and say what somebody *is*,
   * while this asks whether they currently work somewhere — which is the thing
   * that should stop being true the day they leave.
   */
  /**
   * Whether this viewer works for an academy, and may therefore see a private
   * profile.
   *
   * ## Scouts count, but only through a verified academy
   *
   * A private profile is hidden from search and from the public web; the people
   * it is *not* hidden from are the ones doing the recruiting the player joined
   * to be found by. Managers and coaches have always been in that set. Scouts are
   * now too — but only while they hold an ACTIVE membership at an academy an
   * admin has VERIFIED, which is a far narrower door than "holds the scout role".
   *
   * The narrowness is the point. `scout` is the one role anybody may grant
   * themselves (§1.5), so keying on the role alone would mean a private profile
   * is one button-press away from public — which is not a privacy setting, it is
   * a delay. Membership is granted by a manager and revocable by one, and the
   * academy behind it has been checked by an admin, so there is a named
   * institution accountable for every person who can see a hidden child.
   *
   * A pending or archived academy grants nothing: verification is what makes the
   * accountability real rather than asserted.
   *
   * Neither does a local team. Nobody checked it — that is what makes it a local
   * team rather than an academy — so its staff are exactly the unaccountable
   * viewers this rule exists to keep away from a hidden child's profile. A local
   * team's manager and scouts see what any signed-in user sees.
   */
  /**
   * Every squad this player is in, and every academy they used to be in.
   *
   * ## Three lists, because they are three different questions
   *
   * A player has at most one academy and any number of local teams
   * (PLAYER_SQUAD.md §3, §7), so a single "current squad" could only ever
   * answer one of them — it was the shape this returned before local teams
   * could be several. The academy is a scalar because the domain says so; the
   * teams are a list for the same reason.
   *
   * History is the academies they have left, which the schema already keeps:
   * a membership is never deleted, it becomes RELEASED with `releasedAt` set
   * (see `releaseMember`). So this reads history rather than maintaining a
   * second table that would have to agree with it. Local team history is not
   * kept and not asked for (§8) — leaving one deletes the row.
   *
   * ## Never inferred from history
   *
   * "Current" means an ACTIVE row and nothing else (§18). A player who left
   * Bunyodkor for Paxtakor has two academy rows and only one of them is
   * current; deriving the answer from "most recent" would make the transfer
   * look like it had not happened for as long as the clocks disagreed.
   *
   * ## Outside the profile cache, on purpose
   *
   * `RedisKeys.playerProfile` is invalidated by clip and profile writes and by
   * nothing that changes a membership — accepting an invitation, being
   * released, and leaving a team all leave it alone. Folding these into that
   * cached object would show a player who transferred this morning at their old
   * academy for the rest of the TTL, and fixing it properly would mean an
   * invalidation call in every membership mutation across three services. One
   * indexed lookup per profile read is the cheaper and more honest answer, and
   * it is why `@@index([userId, status])` exists.
   */
  private async membershipsFor(playerUserId: string) {
    const rows = await this.prisma.academyMember.findMany({
      where: { userId: playerUserId, role: 'PLAYER' },
      orderBy: { joinedAt: 'desc' },
      select: {
        academyId: true,
        groupId: true,
        status: true,
        joinedAt: true,
        releasedAt: true,
        group: { select: { name: true } },
        academy: { select: { name: true, kind: true, status: true } },
      },
    });

    const describe = (row: (typeof rows)[number]) => ({
      academyId: row.academyId,
      academyName: row.academy.name,
      kind: row.academy.kind,
      status: row.academy.status,
      /** Null means the academy's reserve — see AcademyMember.groupId. */
      groupId: row.groupId,
      groupName: row.group?.name ?? null,
      joinedAt: row.joinedAt,
      leftAt: row.releasedAt,
    });

    const active = rows.filter((row) => row.status === 'ACTIVE');

    return {
      /** The one current academy, or null. */
      academy: active.filter((row) => row.academy.kind === 'ACADEMY').map(describe)[0] ?? null,
      /** Every local team they currently play for, newest first. */
      localTeams: active.filter((row) => row.academy.kind === 'LOCAL_TEAM').map(describe),
      /**
       * Academies they have left. A current membership is never repeated here —
       * it has not ended, and listing it under history alongside itself would
       * read as having been there twice (§19).
       */
      academyHistory: rows
        .filter((row) => row.academy.kind === 'ACADEMY' && row.status !== 'ACTIVE')
        .map(describe),
    };
  }

  private async isAcademyStaff(viewer?: AuthUser): Promise<boolean> {
    if (!viewer) return false;
    const membership = await this.prisma.academyMember.findFirst({
      where: {
        userId: viewer.userId,
        role: { in: ['MANAGER', 'COACH', 'SCOUT'] },
        status: 'ACTIVE',
        academy: { kind: 'ACADEMY', status: 'VERIFIED' },
      },
      select: { id: true },
    });
    return !!membership;
  }

  /** Read-heavy, slow-changing (1.19) - cached, invalidated by every write below. */
  /**
   * A player's public card.
   *
   * The privacy check runs outside the cache and against the live row: a cached
   * copy taken before the switch was flipped must not keep serving a profile its
   * owner has since hidden. It is one indexed lookup, and the alternative —
   * invalidating every cached profile on a settings change — is a wider blast
   * radius for a rarer event.
   */
  async getPublicProfile(playerId: string, viewer?: AuthUser) {
    const owner = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      select: { userId: true, user: { select: { isPrivate: true } } },
    });
    if (!owner) throw new NotFoundException('Player not found');

    const isSelf = viewer?.userId === owner.userId;
    const isAdmin = !!viewer?.roles.some((role) => role === 'admin' || role === 'super_admin');
    // 404 rather than 403: "you may not see this" confirms the player exists.
    if (owner.user.isPrivate && !isSelf && !isAdmin && !(await this.isAcademyStaff(viewer))) {
      throw new NotFoundException('Player not found');
    }

    const profile = await this.redis.wrap(
      RedisKeys.playerProfile(playerId),
      CacheTtl.playerProfile,
      async () => {
        const found = await this.prisma.playerProfile.findUnique({
          where: { id: playerId },
          // The public profile read, cached in Redis and served to everyone —
          // verified clips only. The owner's own view of their clips comes from
          // `GET /media/player/:id`, which knows who is asking; this one cannot,
          // because the cache entry is shared.
          include: { media: { where: PUBLIC_MEDIA_WHERE }, ...AVATAR_INCLUDE },
        });
        if (!found) return found;
        const stars = await this.starsFor([found.id]);
        return { ...this.withAvatar(found), stars: stars.get(found.id) ?? 0 };
      },
    );
    if (!profile) throw new NotFoundException('Player not found');
    return { ...profile, memberships: await this.membershipsFor(owner.userId) };
  }

  /**
   * The player edits their own card.
   *
   * `birthDate` is bounded here rather than trusted from the DTO. It is an age
   * gate as much as a detail — the card's age band, the trial age checks and what
   * counts as an under-18 account all read it — so a date that would make somebody
   * three years old or fifty is refused, and every change to it lands in the audit
   * log with the value it replaced. Neither stops a determined player editing it;
   * both mean nobody can later claim the platform did not notice.
   */
  /**
   * Checks the region/district pair as the update would *leave* the row.
   *
   * The DTO validator sees only the request, so a PATCH sending one half of the
   * pair slips past it — `{ region: 'Namangan viloyati' }` on a player stored in
   * `Xiva` is two individually-valid values that together name a place that does
   * not exist. Merging with the stored row is the only way to see it.
   *
   * Returns the canonical spellings so an ASCII apostrophe typed by hand is
   * stored the same way the picker would have stored it — two spellings of one
   * district would split the same place in search.
   */
  private resolveRegionDistrict(
    stored: { region: string | null; district: string | null },
    dto: { region?: string; district?: string },
  ): { region?: string | null; district?: string | null } {
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

    // Only the fields the caller actually sent are written back, so an untouched
    // half is not rewritten just because the other one moved.
    const patch: { region?: string | null; district?: string | null } = {};
    const canonicalRegion = normaliseRegion(nextRegion);
    if (dto.region !== undefined) patch.region = canonicalRegion;
    if (dto.district !== undefined) {
      patch.district = canonicalRegion ? normaliseDistrict(canonicalRegion, nextDistrict) : null;
    }
    return patch;
  }

  async updateProfile(userId: string, dto: UpdatePlayerProfileDto) {
    const profile = await this.assertOwner(userId);

    // The pair as the row would end up, not as the request happens to describe
    // it — see resolveRegionDistrict.
    const location = this.resolveRegionDistrict(profile, dto);

    if (dto.birthDate !== undefined) {
      const next = new Date(dto.birthDate);
      const age = ageOn(next);
      if (Number.isNaN(next.getTime()) || age < MIN_PLAYER_AGE || age > MAX_PLAYER_AGE) {
        throw new BadRequestException(
          `Enter a date of birth between ${MIN_PLAYER_AGE} and ${MAX_PLAYER_AGE} years ago`,
        );
      }
      if (next.getTime() !== profile.birthDate.getTime()) {
        await this.audit.record(userId, AuditAction.PLAYER_BIRTHDATE_CHANGED, {
          playerId: profile.id,
          from: profile.birthDate.toISOString().slice(0, 10),
          to: next.toISOString().slice(0, 10),
        });
      }
    }

    const updated = await this.prisma.playerProfile.update({
      where: { userId },
      data: {
        ...dto,
        ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
        // Canonical spellings, after the merged pair was checked.
        ...location,
      },
    });
    await this.redis.del(RedisKeys.playerProfile(updated.id));
    return updated;
  }

  async updateStats(userId: string, dto: UpdatePlayerStatsDto) {
    await this.assertOwner(userId);
    const updated = await this.prisma.playerProfile.update({ where: { userId }, data: dto });
    await this.redis.del(RedisKeys.playerProfile(updated.id));
    return updated;
  }

  async search(dto: SearchPlayersDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    // A private account is absent from search, not merely unreadable when opened:
    // a hit that 404s still tells the searcher the person is here.
    const where: Prisma.PlayerProfileWhereInput = { user: { isPrivate: false } };
    /*
     * Filters match the canonical spelling, not what was typed.
     *
     * A query string reaches here by hand as often as from the picker, and
     * `Farg'ona viloyati` with an ASCII apostrophe would match nothing at all
     * while looking perfectly correct in the URL. An unrecognised province
     * narrows to nothing rather than being ignored — silently returning every
     * player for a filter the caller believes is applied is the worse answer.
     */
    if (dto.region) where.region = normaliseRegion(dto.region) ?? '\u0000';
    if (dto.district && dto.region) {
      const canonicalRegion = normaliseRegion(dto.region);
      where.district = canonicalRegion
        ? (normaliseDistrict(canonicalRegion, dto.district) ?? '\u0000')
        : '\u0000';
    }
    if (dto.playingStyle) where.playingStyle = dto.playingStyle;
    if (dto.position) {
      where.OR = [{ primaryPosition: dto.position }, { secondaryPosition: dto.position }];
    }
    // Age is asked in years and stored as a birth date, so the bound flips: the
    // youngest allowed age is the *latest* birth date that still qualifies.
    // `maxAge` is inclusive, so it reaches back to the day before that birthday.
    if (dto.minAge !== undefined || dto.maxAge !== undefined) {
      const today = new Date();
      where.birthDate = {
        ...(dto.minAge !== undefined
          ? { lte: new Date(today.getFullYear() - dto.minAge, today.getMonth(), today.getDate()) }
          : {}),
        ...(dto.maxAge !== undefined
          ? {
              gt: new Date(today.getFullYear() - dto.maxAge - 1, today.getMonth(), today.getDate()),
            }
          : {}),
      };
    }

    if (dto.query) {
      where.AND = [
        {
          OR: [
            { firstName: { contains: dto.query, mode: 'insensitive' } },
            { lastName: { contains: dto.query, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.playerProfile.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: AVATAR_INCLUDE,
      }),
      this.prisma.playerProfile.count({ where }),
    ]);

    // Two queries for the whole page's stars, not one per card.
    const stars = await this.starsFor(items.map((item) => item.id));

    return {
      items: items.map((item) => ({
        ...this.withAvatar(item),
        stars: stars.get(item.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async assertOwner(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Player profile not found');
    if (profile.userId !== userId) throw new ForbiddenException();
    return profile;
  }
}
