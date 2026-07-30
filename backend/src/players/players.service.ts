import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CacheTtl, RedisKeys } from '../redis/redis.keys';
import { RbacService } from '../rbac/rbac.service';
import {
  CreatePlayerProfileDto,
  SearchPlayersDto,
  UpdatePlayerProfileDto,
  UpdatePlayerStatsDto,
} from './dto/player.dto';

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private redis: RedisService,
  ) {}

  async createProfile(userId: string, dto: CreatePlayerProfileDto) {
    const existing = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Player profile already exists');

    const profile = await this.prisma.playerProfile.create({
      data: { userId, ...dto, birthDate: new Date(dto.birthDate) },
    });
    // Player is an "additional role" per README 1.2 - granted on profile creation.
    await this.rbac.assignRole(userId, 'player');
    return profile;
  }

  async getOwnProfile(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Player profile not found');
    return profile;
  }

  /** Read-heavy, slow-changing (1.19) - cached, invalidated by every write below. */
  async getPublicProfile(playerId: string) {
    const profile = await this.redis.wrap(
      RedisKeys.playerProfile(playerId),
      CacheTtl.playerProfile,
      () =>
        this.prisma.playerProfile.findUnique({
          where: { id: playerId },
          include: { media: { where: { status: 'ACTIVE' } } },
        }),
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
      }),
      this.prisma.playerProfile.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  private async assertOwner(userId: string) {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Player profile not found');
    if (profile.userId !== userId) throw new ForbiddenException();
    return profile;
  }
}
