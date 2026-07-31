import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationChannel } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { assertKeyUnder, avatarKey, avatarPrefix } from '../storage/storage.keys';
import {
  AvatarUploadUrlDto,
  RequestContactChangeDto,
  UpdateProfileDto,
  VerifyContactChangeDto,
} from './dto/user.dto';

const CONTACT_CODE_TTL_SECONDS = 600;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarKey: true,
        // Drives the forced password change on an admin-created account — the
        // client can't know to redirect without it.
        mustChangePassword: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const access = await this.rbac.getEffectiveAccess(userId);
    // The URL is built here, at read time, so changing CDN or provider is a
    // config change rather than a migration.
    const { avatarKey: key, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(key), ...access };
  }

  /**
   * Everything the profile screen shows, in one round trip: identity, roles, and
   * the per-role counters that make a profile worth opening.
   *
   * Assembled here rather than by the client calling five endpoints — most of these
   * are cheap counts, and a profile page that fires five requests on an entry-level
   * phone over mobile data (README §14) is the wrong shape.
   */
  async findMeWithStats(userId: string) {
    const me = await this.findMe(userId);

    const [player, coach, scoutStats, academyMemberships, followingCount, followerAcademies] =
      await Promise.all([
        this.prisma.playerProfile.findUnique({
          where: { userId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            birthDate: true,
            primaryPosition: true,
            playingStyle: true,
            region: true,
            matches: true,
            goals: true,
            assists: true,
            _count: { select: { media: true, trialApplications: true, recommendations: true } },
          },
        }),
        this.prisma.coachProfile.findUnique({
          where: { userId },
          select: { id: true, status: true, _count: { select: { assessments: true } } },
        }),
        this.prisma.scoutStats.findUnique({ where: { userId } }),
        this.prisma.academyMember.findMany({
          where: { userId },
          select: {
            academyId: true,
            role: true,
            academy: { select: { name: true, status: true } },
          },
        }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.academyScoutFollow.count({
          where: { scoutId: userId, state: 'FOLLOWING' },
        }),
      ]);

    return {
      ...me,
      stats: {
        player: player
          ? {
              profileId: player.id,
              birthDate: player.birthDate,
              primaryPosition: player.primaryPosition,
              playingStyle: player.playingStyle,
              region: player.region,
              matches: player.matches,
              goals: player.goals,
              assists: player.assists,
              mediaCount: player._count.media,
              trialApplications: player._count.trialApplications,
              recommendationsReceived: player._count.recommendations,
            }
          : null,
        coach: coach
          ? { profileId: coach.id, status: coach.status, assessments: coach._count.assessments }
          : null,
        scout: scoutStats
          ? {
              totalRecommendations: scoutStats.totalRecommendations,
              acceptedRecommendations: scoutStats.acceptedRecommendations,
              successRate: scoutStats.successRate,
              level: scoutStats.level,
              weight: scoutStats.weight,
              followerAcademies,
            }
          : null,
        academies: academyMemberships.map((membership) => ({
          academyId: membership.academyId,
          name: membership.academy.name,
          status: membership.academy.status,
          role: membership.role,
        })),
        following: followingCount,
      },
    };
  }

  // ---------- Profile editing ----------

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // The key round-tripped through the browser. Without this a caller could
    // point their avatar at any object in the bucket, including someone else's.
    if (dto.avatarStorageKey !== undefined) {
      assertKeyUnder(dto.avatarStorageKey, avatarPrefix(userId));
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        // The key is stored; the URL is derived on the way out.
        ...(dto.avatarStorageKey !== undefined ? { avatarKey: dto.avatarStorageKey } : {}),
      },
      select: { id: true, firstName: true, lastName: true, avatarKey: true },
    });

    const { avatarKey: key, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(key) };
  }

  /**
   * Presigned PUT for an avatar — the one public tier.
   *
   * Avatars are meant to be cached and hotlinked, so they keep a permanent public
   * URL. The key is minted here from the caller's own id; nothing the client
   * sends influences where the object lands.
   */
  async avatarUploadUrl(userId: string, dto: AvatarUploadUrlDto) {
    const storageKey = avatarKey(userId, dto.filename);
    const ticket = await this.storage.createUploadUrl(storageKey, dto.contentType);
    return { ...ticket, publicUrl: this.storage.buildPublicUrl(storageKey) };
  }

  // ---------- Changing phone / email ----------

  /**
   * Issues a code to the NEW destination, proving the caller controls it before it
   * replaces what's on the account.
   *
   * Delivery is a stub for both channels (SMS gateway and email provider are the
   * documented unimplemented integrations). In non-production the code is echoed
   * back so the flow is testable; in production nothing is sent and the caller is
   * told so, rather than being left waiting for a message that never arrives.
   */
  async requestContactChange(userId: string, dto: RequestContactChangeDto) {
    const destination = this.normaliseDestination(dto.channel, dto.destination);
    await this.assertDestinationFree(dto.channel, destination, userId);

    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = await argon2.hash(code);

    await this.prisma.verificationCode.create({
      data: {
        userId,
        channel: dto.channel,
        destination,
        codeHash,
        expiresAt: new Date(Date.now() + CONTACT_CODE_TTL_SECONDS * 1000),
      },
    });

    const isProduction = this.config.get('NODE_ENV') === 'production';
    if (isProduction) {
      this.logger.warn(
        `No ${dto.channel} delivery is configured; a contact-change code was generated but not sent.`,
      );
    }

    return {
      sent: !isProduction,
      deliveryConfigured: false,
      expiresInSeconds: CONTACT_CODE_TTL_SECONDS,
      ...(isProduction ? {} : { devCode: code }),
    };
  }

  async verifyContactChange(userId: string, dto: VerifyContactChangeDto) {
    const destination = this.normaliseDestination(dto.channel, dto.destination);

    const record = await this.prisma.verificationCode.findFirst({
      where: { userId, channel: dto.channel, destination, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('No pending code for that destination');
    if (record.expiresAt < new Date()) throw new BadRequestException('That code has expired');

    const valid = await argon2.verify(record.codeHash, dto.code);
    if (!valid) throw new BadRequestException('That code is not correct');

    // Re-check at the moment of the write: someone else may have taken the
    // address between the request and the confirmation.
    await this.assertDestinationFree(dto.channel, destination, userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.verificationCode.update({
        where: { id: record.id },
        data: { consumed: true },
      });

      return tx.user.update({
        where: { id: userId },
        data:
          dto.channel === VerificationChannel.PHONE
            ? { phone: destination }
            : { email: destination },
        select: { id: true, email: true, phone: true },
      });
    });
  }

  private normaliseDestination(channel: VerificationChannel, raw: string): string {
    const value = raw.trim();

    if (channel === VerificationChannel.EMAIL) {
      const normalised = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalised)) {
        throw new BadRequestException('Enter a valid email address');
      }
      return normalised;
    }

    // E.164. The backend's login DTOs use class-validator's @IsPhoneNumber; this
    // mirrors the shape rather than importing a validator for one field.
    const normalised = value.replace(/[\s-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalised)) {
      throw new BadRequestException('Enter the number in full, e.g. +998901234567');
    }
    return normalised;
  }

  private async assertDestinationFree(
    channel: VerificationChannel,
    destination: string,
    userId: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where:
        channel === VerificationChannel.PHONE ? { phone: destination } : { email: destination },
      select: { id: true },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException(
        channel === VerificationChannel.PHONE
          ? 'That phone number is already used by another account'
          : 'That email is already used by another account',
      );
    }
  }

  async findPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, avatarKey: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { avatarKey: key, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(key) };
  }
}
