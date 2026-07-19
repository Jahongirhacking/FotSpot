import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import {
  CreatePlayerProfileDto,
  SearchPlayersDto,
  UpdatePlayerProfileDto,
  UpdatePlayerStatsDto,
} from './dto/player.dto';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService, private rbac: RbacService) {}

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

  async getPublicProfile(playerId: string) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { id: playerId },
      include: { media: { where: { status: 'ACTIVE' } } },
    });
    if (!profile) throw new NotFoundException('Player not found');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdatePlayerProfileDto) {
    await this.assertOwner(userId);
    return this.prisma.playerProfile.update({ where: { userId }, data: dto });
  }

  async updateStats(userId: string, dto: UpdatePlayerStatsDto) {
    await this.assertOwner(userId);
    return this.prisma.playerProfile.update({ where: { userId }, data: dto });
  }

  async search(dto: SearchPlayersDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;

    const where: any = {};
    if (dto.region) where.region = dto.region;
    if (dto.position) {
      where.OR = [
        { primaryPosition: dto.position },
        { secondaryPosition: dto.position },
      ];
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
