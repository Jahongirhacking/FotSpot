import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
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

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
    private storage: StorageService,
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
  async getPublicProfile(playerId: string) {
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

  async updateProfile(userId: string, dto: UpdatePlayerProfileDto) {
    await this.assertOwner(userId);
    const updated = await this.prisma.playerProfile.update({ where: { userId }, data: dto });
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

    const where: Prisma.PlayerProfileWhereInput = {};
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
