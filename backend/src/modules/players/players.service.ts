// src/modules/players/players.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreatePlayerProfileDto } from "./dto/create-player.dto";

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Create Profile ──────────────────────────────────────────────
  async createProfile(userId: string, dto: CreatePlayerProfileDto) {
    const existing = await this.prisma.playerProfile.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException("Player profile already exists");

    const profile = await this.prisma.playerProfile.create({
      data: { userId, ...dto },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });

    // Give user the PLAYER role as well
    const playerRole = await this.prisma.role.findUnique({
      where: { name: "PLAYER" },
    });
    if (playerRole) {
      await this.prisma.userRole
        .create({ data: { userId, roleId: playerRole.id } })
        .catch(() => {}); // Ignore if already has role
    }

    return profile;
  }

  // ─── Find one player ─────────────────────────────────────────────
  async findOne(id: string) {
    const cacheKey = RedisService.keys.playerProfile(id);

    // Try cache first
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const player = await this.prisma.playerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
        media: {
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 6,
        },
        assessments: {
          include: {
            coach: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    if (!player) throw new NotFoundException("Player profile not found");

    // Cache for 5 minutes
    await this.redis.setJson(cacheKey, player, 300);
    return player;
  }

  // ─── Find by userId ───────────────────────────────────────────────
  async findByUserId(userId: string) {
    const player = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
        media: {
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    if (!player) throw new NotFoundException("Player profile not found");
    return player;
  }

  // ─── Search/List players ─────────────────────────────────────────
  async findAll(query: {
    position?: string;
    region?: string;
    minAge?: number;
    maxAge?: number;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.position) where.primaryPosition = query.position;
    if (query.region)
      where.region = { contains: query.region, mode: "insensitive" };

    // Age filter: convert age to birthDate range
    if (query.minAge || query.maxAge) {
      const now = new Date();
      where.birthDate = {};
      if (query.maxAge) {
        where.birthDate.gte = new Date(
          now.getFullYear() - query.maxAge,
          now.getMonth(),
          now.getDate(),
        );
      }
      if (query.minAge) {
        where.birthDate.lte = new Date(
          now.getFullYear() - query.minAge,
          now.getMonth(),
          now.getDate(),
        );
      }
    }

    const [players, total] = await Promise.all([
      this.prisma.playerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { firstName: true, lastName: true, avatar: true } },
        },
      }),
      this.prisma.playerProfile.count({ where }),
    ]);

    return {
      players,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Update profile ───────────────────────────────────────────────
  async updateProfile(userId: string, dto: Partial<CreatePlayerProfileDto>) {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Player profile not found");

    const updated = await this.prisma.playerProfile.update({
      where: { userId },
      data: dto,
    });

    // Invalidate cache
    await this.redis.del(RedisService.keys.playerProfile(profile.id));
    return updated;
  }

  // ─── Update stats ─────────────────────────────────────────────────
  async updateStats(
    userId: string,
    stats: {
      matches?: number;
      goals?: number;
      assists?: number;
      cleanSheets?: number;
    },
  ) {
    return this.updateProfile(userId, stats);
  }
}
