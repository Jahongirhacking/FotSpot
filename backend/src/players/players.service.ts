import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { normaliseUsername } from '../users/username.util';
import {
  CreatePlayerProfileDto,
  SearchPlayersDto,
  UpdatePlayerProfileDto,
  UpdatePlayerStatsDto,
} from './dto/player.dto';

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

  async createProfile(userId: string, dto: CreatePlayerProfileDto) {
    const existing = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Player profile already exists');

    // Player is an "additional role" per README 1.2, granted on profile creation.
    // Both halves commit together: a profile without the role leaves the user
    // unable to apply for trials, and a retry hits "profile already exists".
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.playerProfile.create({
        data: { userId, ...dto, birthDate: new Date(dto.birthDate) },
      });
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
    return this.withAvatar(profile);
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
    if (owner.user.isPrivate && !isSelf && !isAdmin)
      throw new NotFoundException('Player not found');

    const profile = await this.redis.wrap(
      RedisKeys.playerProfile(playerId),
      CacheTtl.playerProfile,
      async () => {
        const found = await this.prisma.playerProfile.findUnique({
          where: { id: playerId },
          include: { media: { where: { status: 'ACTIVE' } }, ...AVATAR_INCLUDE },
        });
        return found && this.withAvatar(found);
      },
    );
    if (!profile) throw new NotFoundException('Player not found');
    return profile;
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
  async updateProfile(userId: string, dto: UpdatePlayerProfileDto) {
    const profile = await this.assertOwner(userId);

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
      data: { ...dto, ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}) },
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
    if (dto.region) where.region = dto.region;
    if (dto.playingStyle) where.playingStyle = dto.playingStyle;
    if (dto.position) {
      where.OR = [{ primaryPosition: dto.position }, { secondaryPosition: dto.position }];
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

    return { items: items.map((item) => this.withAvatar(item)), total, page, pageSize };
  }

  private async assertOwner(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Player profile not found');
    if (profile.userId !== userId) throw new ForbiddenException();
    return profile;
  }
}
