import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VerificationChannel } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { OWN_MEDIA_WHERE } from '../media/media-visibility.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RedisService } from '../redis/redis.service';
import { RedisKeys } from '../redis/redis.keys';
import { assertKeyUnder, avatarKey, avatarPrefix } from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import {
  AvatarUploadUrlDto,
  RequestContactChangeDto,
  UpdateProfileDto,
  VerifyContactChangeDto,
} from './dto/user.dto';
import { generateUsername, normaliseUsername, validateUsername } from './username.util';

const CONTACT_CODE_TTL_SECONDS = 600;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private rbac: RbacService,
    private storage: StorageService,
    private config: ConfigService,
    private email: EmailService,
    private redis: RedisService,
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
        // Settings renders the privacy switch from this, so it has to be here
        // rather than behind a second request the page would have to wait on.
        isPrivate: true,
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
            /*
             * Clips that still exist, not clips ever uploaded.
             *
             * `media: true` counted every row, and deleting a clip does not
             * remove its row — `MediaService.remove` is a soft delete that keeps
             * the rating history, the likes and the moderation trail while the
             * object itself is dropped from the bucket. So a player who uploaded
             * three clips and deleted all three still read "3", and no amount of
             * refreshing changed it: the number was right about a history nobody
             * asked to see.
             *
             * `OWN_MEDIA_WHERE` is the same filter `MediaService.listForPlayer`
             * gives the owner, which is the point of reusing it rather than
             * writing `status: { not: 'REMOVED' }` here. This stat sits directly
             * above that list on /profile, so the two now agree by construction
             * — the number says exactly what the person can count on screen, and
             * a later change to what an owner may see moves both together.
             */
            _count: {
              select: {
                media: { where: OWN_MEDIA_WHERE },
                trialApplications: true,
                recommendations: true,
              },
            },
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

    // Read only when the avatar is actually changing — every other profile edit
    // would be paying for a round trip it has no use for.
    const previousAvatarKey =
      dto.avatarStorageKey !== undefined
        ? ((
            await this.prisma.user.findUnique({
              where: { id: userId },
              select: { avatarKey: true },
            })
          )?.avatarKey ?? null)
        : null;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        // The key is stored; the URL is derived on the way out.
        ...(dto.avatarStorageKey !== undefined ? { avatarKey: dto.avatarStorageKey } : {}),
        ...(dto.isPrivate !== undefined ? { isPrivate: dto.isPrivate } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        avatarKey: true,
        isPrivate: true,
      },
    });

    /*
     * A person has one name, whatever roles they hold.
     *
     * `PlayerProfile` carries its own `firstName`/`lastName`, copied at
     * onboarding. Nothing kept the copy in step, so changing your name here left
     * the player card showing the old one — the same human appearing under two
     * names depending on which screen you were on, and no way to tell which was
     * current. A player is not a separate person from the account that holds it.
     *
     * The account is the source of truth and this propagates the change; the
     * copy is not a second opinion. `updateMany` rather than `update` because a
     * user need not have a player profile at all, and a missing row is the
     * ordinary case rather than an error.
     *
     * The duplicated columns should not exist — the proper fix is for the card
     * to read the account's name — but that is a migration on a required column
     * and every read of a player's name. Until then this keeps the two from
     * diverging, which is the part users can see.
     */
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      await this.prisma.playerProfile.updateMany({
        where: { userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        },
      });
      // The card embeds the name, so its cached copy is now stale.
      const profile = await this.prisma.playerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (profile) await this.redis.del(RedisKeys.playerProfile(profile.id));
    }

    if (previousAvatarKey && previousAvatarKey !== user.avatarKey) {
      await this.discardAvatar(userId, previousAvatarKey);
    }

    const { avatarKey: key, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(key) };
  }

  /**
   * Deletes the avatar a user has just replaced.
   *
   * ## After the write, and never before it
   *
   * The row is updated first, so the only way to reach here is with the new
   * avatar already the account's. Deleting first would mean a failed update
   * leaves the profile pointing at an object that no longer exists — a broken
   * picture the user cannot fix except by uploading again.
   *
   * ## And it does not fail the request
   *
   * DELIBERATE SWALLOW, and a narrow one. By this point the avatar has changed:
   * the caller got what they asked for, and the only thing left is housekeeping.
   * Throwing would report failure for an operation that succeeded, and the retry
   * it invites uploads a *second* new object — so the response to a leaked object
   * would be to leak another. The orphan costs a few kilobytes and is logged.
   *
   * ## Scoped to the caller's own directory
   *
   * `avatarKey` is only ever written by `updateProfile`, which checks the key is
   * under this user's prefix before storing it, so this can only re-confirm what
   * is already true. It is here because the operation is a delete: if a row ever
   * does hold something unexpected — hand-edited, restored from an old backup,
   * written by some future code path — the outcome should be a skipped cleanup
   * and a log line, not an object of somebody else's removed on their behalf.
   */
  private async discardAvatar(userId: string, storageKey: string): Promise<void> {
    try {
      assertKeyUnder(storageKey, avatarPrefix(userId));
    } catch {
      this.logger.warn(
        `Not deleting the previous avatar of ${userId}: "${storageKey}" is not in that ` +
          'account’s own avatar directory. The new avatar is saved; this object was left alone.',
      );
      return;
    }

    try {
      await this.storage.deleteObject(storageKey);
    } catch (error) {
      this.logger.warn(
        `Replaced the avatar of ${userId} but could not delete the old object ` +
          `"${storageKey}": ${(error as Error).message}. The profile is correct; the object ` +
          'is orphaned in the bucket.',
      );
    }
  }

  /**
   * Presigned PUT for an avatar, into the public bucket.
   *
   * Avatars are meant to be cached and hotlinked, so they keep a permanent public
   * URL. The key is minted here from the caller's own id; nothing the client
   * sends influences where the object lands.
   *
   * `avatarKey` puts it under `public/`, and that prefix is what sends the PUT to
   * `R2_PUBLIC_BUCKET` — the same fact that makes `buildPublicUrl` willing to
   * address it. The two cannot disagree, because they read the same key rather
   * than each being told a bucket separately.
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

    /*
     * Email goes through Resend; SMS is still the documented stub.
     *
     * Confirming a new address is exactly the case where an undelivered code is
     * worst — the account keeps the old address, and the person is left believing
     * the change is under way. So a failure is reported rather than reported as
     * success, and the channel that has no gateway yet still says so plainly.
     */
    const isProduction = this.config.get('NODE_ENV') === 'production';
    const isEmail = dto.channel === VerificationChannel.EMAIL;

    const { sent } = isEmail
      ? await this.email.sendCode(destination, code, 'contact-change')
      : { sent: false };

    if (isEmail && !sent && this.email.isConfigured) {
      throw new ServiceUnavailableException(
        'We could not send the code just now. Please try again in a moment.',
      );
    }

    if (!sent && isProduction) {
      this.logger.warn(
        `No ${dto.channel} delivery is configured; a contact-change code was generated but not sent.`,
      );
    }

    return {
      sent,
      deliveryConfigured: isEmail && this.email.isConfigured,
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

  /**
   * Someone else's profile.
   *
   * A private account answers exactly as a missing one does — 404, not 403.
   * "You may not see this profile" confirms the profile exists, which for a
   * platform whose users are children is the same disclosure the setting was
   * turned on to prevent. The viewer's own account and admins are exempt.
   */
  async findPublicProfile(userId: string, viewer?: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarKey: true,
        createdAt: true,
        isPrivate: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const isSelf = viewer?.userId === user.id;
    const isAdmin = !!viewer?.roles.some((role) => role === 'admin' || role === 'super_admin');
    if (user.isPrivate && !isSelf && !isAdmin) throw new NotFoundException('User not found');

    const { avatarKey: key, isPrivate, ...rest } = user;
    return { ...rest, avatarUrl: this.storage.publicUrlOrNull(key) };
  }

  /**
   * The short "who am I here" block behind the avatar menu.
   *
   * One request rather than the four the menu would otherwise make on every page:
   * counts plus whatever the active role makes relevant — the academy a coach
   * works for and how many players they assess, the squad a manager runs, the
   * academy and coach a player belongs to.
   *
   * ## Followers, on a platform with no user-to-user follow
   *
   * `Follow` targets a *player profile* or an academy, not an account, and
   * academies follow scouts through a separate table. So "followers" is the sum
   * of the two things that can point at this person: people following their
   * player card, and academies following them as a scout. Anything else would be
   * inventing a number.
   */
  async summary(userId: string) {
    const [player, coach, memberships, following, playerFollowers, academyFollowers] =
      await Promise.all([
        this.prisma.playerProfile.findUnique({
          where: { userId },
          select: { id: true, firstName: true, lastName: true },
        }),
        this.prisma.coachProfile.findUnique({
          where: { userId },
          select: { id: true, status: true },
        }),
        this.prisma.academyMember.findMany({
          where: { userId, status: { not: 'RELEASED' } },
          select: {
            academyId: true,
            role: true,
            status: true,
            academy: {
              select: { id: true, name: true, region: true, district: true, status: true },
            },
          },
        }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        // Followers of this person's player card, if they have one.
        this.prisma.playerProfile
          .findUnique({ where: { userId }, select: { id: true } })
          .then((profile) =>
            profile
              ? this.prisma.follow.count({
                  where: { targetType: 'PLAYER', targetId: profile.id },
                })
              : 0,
          ),
        this.prisma.academyScoutFollow.count({ where: { scoutId: userId, state: 'FOLLOWING' } }),
      ]);

    const membership = memberships.find((row) => row.role !== 'PLAYER') ?? memberships[0];
    const academyId = membership?.academyId;

    // Counts only where they mean something: a manager's squad, a coach's caseload.
    const [coaches, players, scouts, assessed] = await Promise.all([
      academyId
        ? this.prisma.academyMember.count({ where: { academyId, role: 'COACH', status: 'ACTIVE' } })
        : 0,
      academyId
        ? this.prisma.academyMember.count({
            where: { academyId, role: 'PLAYER', status: 'ACTIVE' },
          })
        : 0,
      academyId
        ? this.prisma.academyMember.count({ where: { academyId, role: 'SCOUT', status: 'ACTIVE' } })
        : 0,
      coach
        ? this.prisma.coachAssessment
            .findMany({ where: { coachProfileId: coach.id }, select: { playerId: true } })
            .then((rows) => new Set(rows.map((row) => row.playerId)).size)
        : 0,
    ]);

    const playerCoach = player ? await this.playerCoach(player.id) : null;

    return {
      followers: playerFollowers + academyFollowers,
      following,
      player: player ? { profileId: player.id, coach: playerCoach } : null,
      coach: coach
        ? { profileId: coach.id, status: coach.status, assessedPlayers: assessed }
        : null,
      academy: membership?.academy
        ? {
            ...membership.academy,
            myRole: membership.role,
            coaches,
            players,
            scouts,
          }
        : null,
    };
  }

  /**
   * The coach a player works with: whoever has assessed them most recently from
   * the academy they belong to. The platform has no explicit "my coach" link, and
   * inventing one would be a schema change; the most recent assessment is the
   * honest answer to the same question.
   */
  private async playerCoach(playerId: string) {
    const latest = await this.prisma.coachAssessment.findFirst({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        coachUser: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
      },
    });
    if (!latest) return null;
    return {
      userId: latest.coachUser.id,
      firstName: latest.coachUser.firstName,
      lastName: latest.coachUser.lastName,
      avatarUrl: this.storage.publicUrlOrNull(latest.coachUser.avatarKey),
      lastAssessedAt: latest.createdAt,
    };
  }
}
