import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaCategory,
  Prisma,
  type MediaModerationStatus,
  type MediaStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaFinaliserService } from '../media/media-finaliser.service';
import { MediaRecoveryService } from '../media/media-recovery.service';
import { PROCESSING_GAVE_UP_REASON } from '../media/media-processing.constants';
import { AuditService } from '../audit/audit.service';
import { AuditAction, type AuditActionKey } from '../audit/audit.actions';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { toMediaResponse } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BLOCKED_MEDIA_WHERE,
  FAILED_UPLOADS_WHERE,
  canTransition,
  MODERATION_QUEUE_WHERE,
  transitionRefusal,
} from '../media/media-visibility.util';
import {
  CreateReportDto,
  ListAppealsDto,
  ListMediaDto,
  ModerateCategoryDto,
  ModerateRatingDto,
  ResolveAppealDto,
  ResolveReportDto,
  type MediaStatusFilter,
} from './dto/moderation.dto';
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
    private finaliser: MediaFinaliserService,
    private recovery: MediaRecoveryService,
    private notifications: NotificationsService,
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
   * Every video in one processing status, or all of them — the list PROCESSING
   * and FAILED clips were missing from.
   *
   * The review queue is filtered on `moderationStatus`; this is filtered on
   * `status`, the worker's axis, and asks nothing about moderation. A clip still
   * PROCESSING carries what the queue says about its job — whether anything is
   * still going to finish it, how many attempts that job has made, and how many
   * times processing has been restarted — because "stuck" and "slow" look the
   * same on the row and are not the same problem.
   */
  async listMediaByStatus(dto: ListMediaDto = {}) {
    const status = dto.status ?? 'ALL';
    const where: Prisma.MediaWhereInput = {
      type: 'VIDEO',
      ...(status === 'ALL' ? {} : { status }),
    };
    const page = await this.listMediaFor(where, dto);
    const items = await Promise.all(
      page.items.map(async (item) =>
        item.status === 'PROCESSING'
          ? { ...item, processing: await this.recovery.jobStatus(item.id) }
          : item,
      ),
    );
    return { ...page, items };
  }

  /** How many videos are in each processing status. One grouped count. */
  async countMediaByStatus(): Promise<Record<MediaStatusFilter, number>> {
    const groups = await this.prisma.media.groupBy({
      by: ['status'],
      where: { type: 'VIDEO' },
      _count: { _all: true },
    });
    const counts: Record<MediaStatusFilter, number> = {
      ALL: 0,
      PROCESSING: 0,
      ACTIVE: 0,
      FAILED: 0,
      FLAGGED: 0,
      REMOVED: 0,
    };
    for (const group of groups) {
      counts[group.status] = group._count._all;
      counts.ALL += group._count._all;
    }
    return counts;
  }

  /**
   * Uploads the worker gave up on — **super admin only** (see the controller).
   *
   * The third list, and the one that did not exist. A FAILED clip was visible to
   * its uploader and to nobody else: not the review queue (wants ACTIVE), not
   * the blocked list (wants BLOCKED). When the failure was the platform's own —
   * ffmpeg missing from the host, which is how a batch of dribbling and
   * finishing clips came to read "Video processing is unavailable on the
   * server" — the operator had no screen on which to discover it.
   *
   * Newest first, like the review queue: the uploader waiting is the one who
   * just pressed upload.
   */
  async listFailedMedia(dto: PaginationDto = {}) {
    return this.listMediaFor(FAILED_UPLOADS_WHERE, dto);
  }

  /**
   * Super admin: bring a FAILED upload back by asking the same questions again.
   *
   * ## Not "set it to ACTIVE"
   *
   * ACTIVE means the worker looked in the bucket and found a real video under
   * the size limit — it is a fact the platform established, and the whole
   * reason PROCESSING exists is that nobody's word alone may establish it, an
   * admin's included. So this does not write ACTIVE. It puts the clip back to
   * PROCESSING and runs `MediaFinaliserService.finalise` on it, which is the
   * exact code the worker runs: if the object is there and sound, the clip
   * becomes ACTIVE (and UNVERIFIED, so it then goes through review like any
   * other); if it is not, it is FAILED again with a reason that is true now.
   *
   * That is what makes this safe to offer for the ffmpeg case and every other:
   * the retry cannot publish a row with nothing behind it, because it is the
   * same check that refused to the first time.
   *
   * Inline rather than queued, so the admin who pressed the button gets the
   * answer on the same request — `finalise` was split out of the worker for
   * precisely this kind of caller.
   */
  async retryFailedMedia(actorId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        playerId: true,
        status: true,
        storageKey: true,
        posterKey: true,
        failureReason: true,
        processingAttempts: true,
      },
    });
    if (!media) throw new NotFoundException('Media not found');

    /*
     * A clip still PROCESSING is a different question: not "was the file
     * there" but "is anything still going to answer". If the queue has a live
     * job, the admin is told to wait. If it does not, processing is queued
     * again through the same bounded restart the sweep uses — the transcode
     * job, so an unoptimised original is never promoted — and the row stays
     * PROCESSING until that job writes its verdict. Never ACTIVE from here.
     */
    if (media.status === 'PROCESSING') {
      const job = await this.recovery.jobStatus(mediaId);
      if (job.live) {
        throw new ConflictException(
          `This clip is still being processed (job ${job.state}). Retry if it has not finished within the hour.`,
        );
      }
      const outcome = await this.recovery.restart(media, `admin ${actorId}`);
      if (outcome === 'UNAVAILABLE') {
        throw new ServiceUnavailableException(
          'The processing queue is unreachable right now. Try again shortly.',
        );
      }
      await this.audit.record(actorId, AuditAction.MEDIA_RETRIED, {
        mediaId,
        previousReason: null,
        outcome,
      });
      return this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    }

    if (media.status !== 'FAILED') {
      throw new ConflictException(
        media.status === 'ACTIVE'
          ? 'This clip has already been processed successfully.'
          : 'Only a failed upload can be retried.',
      );
    }

    /*
     * "Process again" for a clip the worker gave up on: back to PROCESSING,
     * conditionally — the same shape `decide` uses, so two admins pressing
     * retry on the same row produce one retry — and then through the same
     * queue and worker every upload goes through (`restart`: the transcode
     * job, then the finaliser). Not finalised inline: an unoptimised original
     * would be promoted without ever being transcoded.
     *
     * The restart counter is reset: it bounds the *automatic* sweep, and an
     * admin's deliberate press is a fresh start, not the fourth automatic try.
     * The moderation status is not touched, here or by the worker — a clip
     * that was VERIFIED stays visible, as the file it has, until the worker
     * replaces it and marks it ACTIVE.
     */
    const { count } = await this.prisma.media.updateMany({
      where: { id: mediaId, status: 'FAILED' },
      data: { status: 'PROCESSING', failureReason: null, processedAt: null, processingAttempts: 0 },
    });
    if (count === 0) {
      throw new ConflictException('This upload is already being retried.');
    }

    const outcome = await this.recovery.restart(
      { ...media, processingAttempts: 0 },
      `admin ${actorId}`,
    );
    if (outcome === 'UNAVAILABLE') {
      // The row went back to PROCESSING and nothing is queued for it: say so
      // now, in the words the sweep would otherwise leave for half an hour.
      await this.finaliser.fail(mediaId, media.failureReason ?? PROCESSING_GAVE_UP_REASON);
      throw new ServiceUnavailableException(
        'The processing queue is unreachable right now. Try again shortly.',
      );
    }

    await this.audit.record(actorId, AuditAction.MEDIA_RETRIED, {
      mediaId,
      previousReason: media.failureReason,
      outcome,
    });

    return this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
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
      select: {
        id: true,
        playerId: true,
        status: true,
        moderationStatus: true,
        storageKey: true,
      },
    });
    if (!media) throw new NotFoundException('Clip not found');

    if (!canTransition(media.moderationStatus, to)) {
      throw new ConflictException(transitionRefusal(media.moderationStatus, to));
    }

    /*
     * A clip the worker has not confirmed — still at it, or gave up — is
     * verified as the file the player uploaded, and goes live as that; the
     * optimised copy replaces the same key later (`WATCHABLE_STATUSES`). What
     * must never go live is a key with nothing under it: the API never saw
     * the bytes, so before the one write that publishes such a clip, the
     * bucket is asked whether the file is there. "Not there" is a 409 the
     * moderator can retry in a minute; "could not ask" is a 503, not a guess.
     */
    if (to === 'VERIFIED' && media.status !== 'ACTIVE') {
      let present: boolean;
      try {
        present = (await this.storage.describeObject(media.storageKey)) !== null;
      } catch (error) {
        this.logger.warn(
          `Could not check storage before verifying ${mediaId}: ${(error as Error).message}`,
        );
        throw new ServiceUnavailableException(
          'Could not reach media storage to confirm this clip is there. Try again shortly.',
        );
      }
      if (!present) {
        throw new ConflictException(
          'This clip has not finished uploading yet, so there is nothing to publish. Try again in a minute.',
        );
      }
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
  /**
   * The four moves the queue's table deliberately leaves out, each its own act.
   *
   * `decide` handles a *first* decision on an unreviewed clip and refuses
   * anything else, so two moderators cannot overwrite each other in the queue.
   * These are second decisions, made from the status lists rather than the
   * queue, and they say so: a super admin taking down a clip that has been
   * live, or putting a blocked one back; an admin clearing or finishing a
   * takedown on a flagged clip. Each is conditional on the row still being in
   * the state the admin saw, audited under its own key, and followed by the
   * same cache purge as every other visibility change.
   */
  async blockActiveMedia(actorId: string, mediaId: string) {
    return this.moveModeration(
      actorId,
      mediaId,
      'VERIFIED',
      'BLOCKED',
      AuditAction.MEDIA_BLOCKED_ACTIVE,
    );
  }

  async unblockMedia(actorId: string, mediaId: string) {
    return this.moveModeration(
      actorId,
      mediaId,
      'BLOCKED',
      'VERIFIED',
      AuditAction.MEDIA_UNBLOCKED,
    );
  }

  async restoreFlaggedMedia(actorId: string, mediaId: string) {
    return this.moveStatus(actorId, mediaId, 'FLAGGED', 'ACTIVE', AuditAction.MEDIA_RESTORED);
  }

  async removeFlaggedMedia(actorId: string, mediaId: string) {
    return this.moveStatus(actorId, mediaId, 'FLAGGED', 'REMOVED', AuditAction.MEDIA_REMOVED);
  }

  private async moveModeration(
    actorId: string,
    mediaId: string,
    from: MediaModerationStatus,
    to: MediaModerationStatus,
    action: AuditActionKey,
  ) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, playerId: true, status: true, moderationStatus: true, storageKey: true },
    });
    if (!media) throw new NotFoundException('Clip not found');
    if (media.moderationStatus !== from) {
      throw new ConflictException(
        `This clip is ${media.moderationStatus.toLowerCase()}, not ${from.toLowerCase()}. Reload the list.`,
      );
    }
    // Putting a clip back on the public surfaces needs the file to be there,
    // for the same reason the queue's verify checks.
    if (to === 'VERIFIED' && media.status !== 'ACTIVE') {
      const present = await this.storage.describeObject(media.storageKey);
      if (!present) {
        throw new ConflictException(
          'There is no file behind this clip, so it cannot be made active.',
        );
      }
    }
    const { count } = await this.prisma.media.updateMany({
      where: { id: mediaId, moderationStatus: from },
      data: { moderationStatus: to },
    });
    if (count === 0) {
      throw new ConflictException(
        'Another moderator changed this clip while you were looking at it. Reload the list.',
      );
    }
    await this.audit.record(actorId, action, {
      mediaId,
      playerId: media.playerId,
      previousStatus: from,
      newStatus: to,
    });
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
  }

  private async moveStatus(
    actorId: string,
    mediaId: string,
    from: MediaStatus,
    to: MediaStatus,
    action: AuditActionKey,
  ) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, playerId: true, status: true },
    });
    if (!media) throw new NotFoundException('Clip not found');
    if (media.status !== from) {
      throw new ConflictException(
        `This clip is ${media.status.toLowerCase()}, not ${from.toLowerCase()}. Reload the list.`,
      );
    }
    const { count } = await this.prisma.media.updateMany({
      where: { id: mediaId, status: from },
      data: { status: to },
    });
    if (count === 0) {
      throw new ConflictException(
        'Another moderator changed this clip while you were looking at it. Reload the list.',
      );
    }
    await this.audit.record(actorId, action, {
      mediaId,
      playerId: media.playerId,
      previousStatus: from,
      newStatus: to,
    });
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
  }

  // ---- Rating in review, and appeals ----
  //
  // Players no longer rate their own clips. The number on a clip comes from a
  // coach who shares a group with the player, or from a moderator here — at
  // review, where a clip cannot be verified until it has one, or on appeal.
  // A moderator's rating weighs as a coach's on the card (card-stars.util).

  /** The categories a rating means something for — everything but highlights. */
  private static readonly RATED_CATEGORIES: MediaCategory[] = Object.values(MediaCategory).filter(
    (category) => category !== 'MATCH_HIGHLIGHTS',
  );

  async rateMedia(actorId: string, mediaId: string, dto: ModerateRatingDto) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        playerId: true,
        status: true,
        category: true,
        rating: true,
        reportedBy: true,
      },
    });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (!ModerationService.RATED_CATEGORIES.includes(media.category)) {
      throw new BadRequestException('Highlights are not evidence for a single attribute');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.ratingRevision.create({
        data: {
          mediaId,
          previousRating: media.rating,
          previousReportedBy: media.reportedBy,
          rating: dto.rating,
          reportedBy: 'RELATIVE',
          actorUserId: actorId,
        },
      });
      return tx.media.update({
        where: { id: mediaId },
        data: { rating: dto.rating, reportedBy: 'RELATIVE' },
      });
    });
    await this.audit.record(actorId, AuditAction.MEDIA_RATED_BY_ADMIN, {
      mediaId,
      playerId: media.playerId,
      previousRating: media.rating,
      rating: dto.rating,
    });
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return toMediaResponse(updated, this.storage);
  }

  /**
   * Re-files a clip under what the footage shows. The rating goes with the old
   * filing — it was a rating of that attribute — so the clip waits for a new
   * one; moving to highlights leaves it unrated for good.
   */
  async recategoriseMedia(actorId: string, mediaId: string, dto: ModerateCategoryDto) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, playerId: true, status: true, category: true, rating: true },
    });
    if (!media || media.status === 'REMOVED') throw new NotFoundException('Clip not found');
    if (media.category === dto.category)
      return toMediaResponse(
        await this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } }),
        this.storage,
      );
    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { category: dto.category, rating: null, reportedBy: 'RELATIVE' },
    });
    await this.audit.record(actorId, AuditAction.MEDIA_RECATEGORISED, {
      mediaId,
      playerId: media.playerId,
      previousCategory: media.category,
      category: dto.category,
      droppedRating: media.rating,
    });
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return toMediaResponse(updated, this.storage);
  }

  /** Appeals, pending first by default, each with the clip and its player. */
  async listAppeals(dto: ListAppealsDto = {}) {
    const status = dto.status ?? 'PENDING';
    const where: Prisma.RatingAppealWhereInput = status === 'ALL' ? {} : { status };
    const { skip, take, page, pageSize } = toSkipTake(dto);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ratingAppeal.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take,
        include: {
          media: { include: { player: { select: QUEUE_PLAYER_SELECT } } },
          resolvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.ratingAppeal.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async ({ media: { player, ...media }, ...appeal }) => ({
        ...appeal,
        clip: {
          ...(await toMediaResponse(media, this.storage)),
          player: {
            ...player,
            userId: player.user.id,
            username: player.user.username,
            avatarUrl: this.storage.publicUrlOrNull(player.user.avatarKey),
            user: undefined,
          },
        },
      })),
    );
    return pageOf(items, total, { page, pageSize });
  }

  /**
   * Answers an appeal: a new rating, or the same one, and a note either way.
   * The player is told; the clip's own trail records any re-rating as a
   * moderator's decision like any other.
   */
  async resolveAppeal(actorId: string, appealId: string, dto: ResolveAppealDto) {
    const appeal = await this.prisma.ratingAppeal.findUnique({
      where: { id: appealId },
      include: {
        media: { select: { id: true, playerId: true, rating: true, category: true, title: true } },
      },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    if (appeal.status !== 'PENDING')
      throw new ConflictException('This appeal has already been answered');

    let finalRating = appeal.media.rating;
    if (dto.rating !== undefined) {
      const rated = await this.rateMedia(actorId, appeal.mediaId, { rating: dto.rating });
      finalRating = rated.rating ?? dto.rating;
    }
    const note = dto.note?.trim() || null;
    const resolved = await this.prisma.ratingAppeal.update({
      where: { id: appealId },
      data: {
        status: 'RESOLVED',
        decisionRating: finalRating,
        decisionNote: note,
        resolvedByUserId: actorId,
        resolvedAt: new Date(),
      },
    });

    const player = await this.prisma.playerProfile.findUnique({
      where: { id: appeal.playerId },
      select: { userId: true },
    });
    if (player) {
      await this.notifications.notify(
        player.userId,
        'RATING_APPEAL_RESOLVED',
        {
          mediaId: appeal.mediaId,
          clipTitle: appeal.media.title,
          category: appeal.media.category,
          previousRating: appeal.ratingAtAppeal,
          rating: finalRating,
          changed: dto.rating !== undefined && dto.rating !== appeal.ratingAtAppeal,
          note,
        },
        { userId: actorId, role: 'admin' },
      );
    }
    await this.audit.record(actorId, AuditAction.RATING_APPEAL_RESOLVED, {
      appealId,
      mediaId: appeal.mediaId,
      playerId: appeal.playerId,
      previousRating: appeal.ratingAtAppeal,
      rating: finalRating,
    });
    return resolved;
  }

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
