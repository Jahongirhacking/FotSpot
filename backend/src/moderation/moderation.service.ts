import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type MediaModerationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.actions';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { toMediaResponse } from '../media/media.service';
import {
  BLOCKED_MEDIA_WHERE,
  canTransition,
  MODERATION_QUEUE_WHERE,
  transitionRefusal,
} from '../media/media-visibility.util';
import { CreateReportDto, ResolveReportDto } from './dto/moderation.dto';
import { PaginationDto, pageOf, toSkipTake } from '../common/dto/pagination.dto';

/** What the moderation queue needs about the player behind a clip. */
const QUEUE_PLAYER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  primaryPosition: true,
  region: true,
  district: true,
  user: { select: { id: true, avatarKey: true, username: true } },
} as const;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private redis: RedisService,
  ) {}

  async fileReport(reporterId: string, dto: CreateReportDto) {
    const hasTarget =
      dto.targetUserId || dto.targetMediaId || dto.targetAcademyId || dto.targetCoachId;
    if (!hasTarget) throw new BadRequestException('A report must reference a target');

    return this.prisma.report.create({
      data: {
        reporterId,
        type: dto.type,
        reason: dto.reason,
        targetUserId: dto.targetUserId,
        targetMediaId: dto.targetMediaId,
        targetAcademyId: dto.targetAcademyId,
        targetCoachId: dto.targetCoachId,
      },
    });
  }

  /**
   * Admin-only, oldest first — a queue, so the front of it is what matters.
   *
   * Paginated because the length of this list is set by *reporters*, not by the
   * platform: a single motivated account can file thousands, and the screen that
   * has to be usable during exactly that incident is this one.
   */
  async listPending(dto: PaginationDto = {}) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return pageOf(items, total, { page, pageSize });
  }

  /** Admin-only: resolves a report, optionally taking down reported media. */
  async resolve(actorId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    if (dto.removeMedia && report.targetMediaId) {
      const removed = await this.prisma.media.update({
        where: { id: report.targetMediaId },
        data: { status: 'REMOVED' },
      });
      await this.audit.record(actorId, AuditAction.MEDIA_TAKEN_DOWN, {
        mediaId: report.targetMediaId,
        reportId,
      });
      // The clip has just left every public surface and the profile read is
      // cached for five minutes — without this it stays on the player's page
      // after being taken down, which is the one delay a takedown cannot have.
      await this.redis.del(RedisKeys.playerProfile(removed.playerId));
    }

    const resolved = await this.prisma.report.update({
      where: { id: reportId },
      data: { status: dto.status, resolutionNote: dto.resolutionNote },
    });

    await this.audit.record(actorId, AuditAction.REPORT_RESOLVED, {
      reportId,
      status: dto.status,
    });
    return resolved;
  }

  /** Admin-only: flag media without a formal report (e.g. proactive moderation). */
  async flagMedia(actorId: string, mediaId: string) {
    const media = await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'FLAGGED' },
    });
    await this.audit.record(actorId, AuditAction.MEDIA_TAKEN_DOWN, { mediaId, flaggedOnly: true });
    // A flagged clip has just left every public surface, and the profile read is
    // cached — see verifyMedia for why this is not optional.
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return media;
  }

  // ---------- Video moderation (§1.7 uploads, admin review) ----------

  /**
   * The clips waiting for a human, newest first.
   *
   * ## Newest first, unlike the report queue above
   *
   * A report is a complaint about something already published and the oldest one
   * is the one that has been wrong for longest, so that queue is FIFO. This is
   * the opposite situation: nothing here is visible to anyone yet, and the cost
   * being paid is a player watching their own upload sit in limbo. The person who
   * just pressed upload is the one waiting, so they are served first.
   *
   * Paginated, and the page carries the player behind each clip — a moderator
   * deciding whether a video is what it claims to be needs to know it is a
   * fourteen-year-old's PACE clip, and a queue that made them open a profile per
   * card would be a request per decision on the screen that must stay fast.
   */
  async listUnverifiedMedia(dto: PaginationDto = {}) {
    return this.listMediaFor(MODERATION_QUEUE_WHERE, dto);
  }

  /**
   * Clips an admin has blocked — **super admin only** (see the controller).
   *
   * ## Why this list exists and who it is for
   *
   * Blocking keeps the row and the video on purpose: "what did we take down, and
   * when" is the question a moderation decision has to be able to answer months
   * later. But kept footage that nobody can reach is still footage of a child
   * sitting in a bucket, and the only person allowed to end that is the super
   * admin (§1.2). Without a screen listing what has been blocked, the delete they
   * alone can perform is reachable only from the pending queue — which by
   * definition no longer contains any of it.
   *
   * So this is the other half of `deleteMedia`: the place a super admin can see
   * the accumulated takedowns and decide which ones stop being kept.
   *
   * Paginated because this list only ever grows — nothing removes a row from it
   * except a permanent delete.
   */
  async listBlockedMedia(dto: PaginationDto = {}) {
    return this.listMediaFor(BLOCKED_MEDIA_WHERE, dto);
  }

  /**
   * One page of clips with the player behind each, URLs signed on.
   *
   * Shared by both review lists: they differ only in which moderation state they
   * ask for, and duplicating the player projection would be two places for
   * "what does a review card need" to drift apart.
   */
  private async listMediaFor(where: Prisma.MediaWhereInput, dto: PaginationDto) {
    const { skip, take, page, pageSize } = toSkipTake(dto);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { player: { select: QUEUE_PLAYER_SELECT } },
      }),
      this.prisma.media.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async ({ player, ...media }) => ({
        ...(await toMediaResponse(media, this.storage)),
        player: {
          ...player,
          userId: player.user.id,
          username: player.user.username,
          avatarUrl: this.storage.publicUrlOrNull(player.user.avatarKey),
          user: undefined,
        },
      })),
    );

    return pageOf(items, total, { page, pageSize });
  }

  /**
   * Admin: this clip is fine, publish it.
   *
   * The whole moderation system exists for this one write. Until it happens a
   * clip is visible to nobody but the account that uploaded it; after it, every
   * existing query picks it up on its own, because they all ask for
   * `moderationStatus = VERIFIED` rather than keeping their own list.
   */
  async verifyMedia(actorId: string, mediaId: string) {
    return this.decide(actorId, mediaId, 'VERIFIED', AuditAction.MEDIA_VERIFIED);
  }

  /**
   * Admin: this clip must not be seen, but it is not destroyed.
   *
   * Blocking keeps the row, the rating history, the likes and the views. "What
   * did we take down, when, and who decided" is the question a moderation
   * decision has to be able to answer months later, and a deleted row answers
   * none of it. Destroying a clip is a separate, super-admin act — see
   * `deleteMedia`.
   */
  async blockMedia(actorId: string, mediaId: string) {
    return this.decide(actorId, mediaId, 'BLOCKED', AuditAction.MEDIA_BLOCKED);
  }

  /**
   * One moderation decision, applied to the row as it is *now*.
   *
   * ## Two admins, one clip
   *
   * The queue is shared, so two moderators can be looking at the same card. If
   * one verifies it and the other then presses Block against a screen loaded a
   * minute ago, the second press must not quietly reverse a decision that has
   * already taken effect — the clip is live by then and may have been watched.
   *
   * `updateMany` with the expected status in its `where` is what makes that safe:
   * the state is checked and changed in one statement, so two simultaneous
   * decisions cannot both read UNVERIFIED and both write. The loser gets a 409
   * naming what actually happened, which is the useful answer — "someone else
   * already verified this" is exactly what the second admin needs to know.
   */
  private async decide(
    actorId: string,
    mediaId: string,
    to: MediaModerationStatus,
    action: typeof AuditAction.MEDIA_VERIFIED | typeof AuditAction.MEDIA_BLOCKED,
  ) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, playerId: true, status: true, moderationStatus: true },
    });
    if (!media) throw new NotFoundException('Clip not found');

    if (!canTransition(media.moderationStatus, to)) {
      throw new ConflictException(transitionRefusal(media.moderationStatus, to));
    }

    const { count } = await this.prisma.media.updateMany({
      // The status the decision was made against, not just the id. See above.
      where: { id: mediaId, moderationStatus: media.moderationStatus },
      data: { moderationStatus: to },
    });
    if (count === 0) {
      throw new ConflictException(
        'Another moderator decided this clip while you were looking at it. Reload the queue.',
      );
    }

    await this.audit.record(actorId, action, {
      mediaId,
      playerId: media.playerId,
      previousStatus: media.moderationStatus,
      newStatus: to,
    });

    /*
     * The public profile read is cached for five minutes and embeds the player's
     * verified clips. Verification is the moment that list changes, so this is
     * the moment to clear it — without this an approved clip would be invisible
     * on the profile for up to five minutes after an admin approved it, which
     * reads as the button not having worked. A block has the mirror problem and
     * the worse one: the clip would stay on the profile after being taken down.
     */
    await this.redis.del(RedisKeys.playerProfile(media.playerId));

    return this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
  }

  /**
   * Super admin: destroy a clip and its files. Irreversible.
   *
   * ## Why this is not what Block does
   *
   * Block is a moderation decision and this is data destruction. They are
   * different acts with different consequences and different people allowed to
   * perform them (§1.2 keeps irreversible platform actions to the super admin,
   * the same rule that governs deleting an account). A moderator working a queue
   * should be able to take something down all day without ever being one
   * mis-click from erasing evidence.
   *
   * The row goes, and with it — by `onDelete: Cascade` — the likes, views,
   * comments, rating revisions and any reports pointing at it. Then the objects,
   * in that order and not the other: a failed delete would otherwise leave a live
   * row addressing a video that no longer exists. A bucket delete that fails is
   * logged with its key rather than thrown, following `MediaService.remove` — the
   * clip is already gone from the platform, and reporting failure for work that
   * succeeded would invite a retry with nothing left to delete.
   */
  async deleteMedia(actorId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Clip not found');

    await this.prisma.media.delete({ where: { id: mediaId } });

    await this.audit.record(actorId, AuditAction.MEDIA_DELETED, {
      mediaId,
      playerId: media.playerId,
      previousStatus: media.moderationStatus,
    });

    for (const key of [media.storageKey, media.posterKey].filter(Boolean) as string[]) {
      await this.storage.deleteObject(key).catch((error: Error) => {
        this.logger.warn(
          `Deleted clip ${mediaId} but could not remove "${key}": ${error.message}. The clip is ` +
            'gone from the platform; this object is orphaned in the bucket.',
        );
      });
    }

    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return { deleted: true, mediaId };
  }
}
