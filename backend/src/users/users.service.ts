import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VerificationChannel } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { assertKeyUnder, avatarKey, avatarPrefix } from '../storage/storage.keys';
import {
  generateUsername,
  normaliseUsername,
  validateUsername,
} from './username.util';
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

    // Accounts created before handles existed have none. Backfilling on first
    // read means nobody has to run a script and no screen has to cope with a
    // missing handle — it happens once per account, ever.
    const username = user.username ?? (await this.backfillUsername(userId));

    const access = await this.rbac.getEffectiveAccess(userId);
    // The URL is built here, at read time, so changing CDN or provider is a
    // config change rather than a migration.
    const { avatarKey: key, ...rest } = user;
    return { ...rest, username, avatarUrl: this.storage.publicUrlOrNull(key), ...access };
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
            secondaryPosition: true,
            dominantFoot: true,
            playingStyle: true,
            region: true,
            district: true,
            height: true,
            weight: true,
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
        /**
         * Deliberately no matches / goals / assists.
         *
         * They are self-reported counters nobody can check, and putting them on
         * the profile as "statistics" gives them the authority of a record. The
         * numbers that belong here are ones the platform can stand behind: clips
         * the player uploaded, trials they applied to, and scouts who put them
         * forward. The editable card details ride along so the profile can offer
         * an edit form without a second request.
         */
        player: player
          ? {
              profileId: player.id,
              birthDate: player.birthDate,
              primaryPosition: player.primaryPosition,
              secondaryPosition: player.secondaryPosition,
              dominantFoot: player.dominantFoot,
              playingStyle: player.playingStyle,
              region: player.region,
              district: player.district,
              height: player.height,
              weight: player.weight,
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

  /**
   * Grants the caller the `scout` role. Idempotent.
   *
   * Returns the refreshed access snapshot so the client can see the new role
   * without a second call — though it still needs a token refresh before any
   * @Roles('scout') route will accept it, since claims are a login-time snapshot
   * (backend/CLAUDE.md §7).
   */
  async becomeScout(userId: string) {
    await this.rbac.assignRole(userId, 'scout');
    return this.rbac.getEffectiveAccess(userId);
  }

  // ---------- Profile editing ----------

  /** Gives a legacy account the handle everything else now assumes it has. */
  private async backfillUsername(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateUsername();
      const clash = await this.prisma.user.findUnique({ where: { username: candidate } });
      if (clash) continue;
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { username: candidate },
        });
        return updated.username!;
      } catch {
        // Lost the race to another request for the same account; try again.
      }
    }
    throw new ConflictException('Could not assign a username — please try again');
  }

  /**
   * Changes the public handle.
   *
   * Uniqueness is enforced by the database, not by a check-then-write: two people
   * claiming the same handle in the same second is exactly the case a prior
   * lookup cannot cover, so P2002 is caught and reported rather than prevented.
   */
  private async setUsername(userId: string, raw: string) {
    const username = normaliseUsername(raw);
    const problem = validateUsername(username);
    if (problem) {
      const messages = {
        'too-short': 'That username is too short',
        'too-long': 'That username is too long',
        shape: 'Use lowercase letters, numbers and single hyphens only',
        reserved: 'That username is reserved',
      } as const;
      throw new BadRequestException(messages[problem.reason]);
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { username } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That username is already taken');
      }
      throw error;
    }
    return username;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // The key round-tripped through the browser. Without this a caller could
    // point their avatar at any object in the bucket, including someone else's.
    if (dto.avatarStorageKey !== undefined) {
      assertKeyUnder(dto.avatarStorageKey, avatarPrefix(userId));
    }
    if (dto.username !== undefined) await this.setUsername(userId, dto.username);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        // The key is stored; the URL is derived on the way out.
        ...(dto.avatarStorageKey !== undefined ? { avatarKey: dto.avatarStorageKey } : {}),
      },
      select: { id: true, firstName: true, lastName: true, username: true, avatarKey: true },
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
