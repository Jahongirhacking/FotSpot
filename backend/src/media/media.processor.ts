import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import {
  FINALISE_CLIP_JOB,
  MAX_CLIP_BYTES,
  MEDIA_QUEUE,
  type FinaliseClipJob,
} from './media-processing.constants';

/**
 * Finishes an upload the API never saw.
 *
 * ## The gap this closes
 *
 * A clip is uploaded with a presigned PUT: the browser sends the file straight
 * to R2 and then tells the API "done". Nothing in that sequence proves anything
 * was stored. Before this worker, `confirmUpload` took the client at its word
 * and wrote an ACTIVE row — so a dropped connection, a closed tab, or a crafted
 * request produced a clip that appeared on a player's card, counted against
 * their plan, and played back as an error. On a platform where a clip is the
 * *evidence* for a self-reported rating (§1.6), a row with nothing behind it is
 * worse than no row.
 *
 * The worker asks the bucket. If the object is there, the clip goes ACTIVE and
 * the size the bucket reports is recorded; if it is not there after every
 * retry, the clip goes FAILED with a reason the uploader can read.
 *
 * ## Why a queue rather than a HEAD inside confirmUpload
 *
 * Timing and blame. The upload may still be in flight when the confirm arrives,
 * so the honest check has to be able to wait and try again — which a request
 * cannot do without holding the player's phone on an open connection. And the
 * network call belongs off the request path: R2 being slow should not make
 * uploading feel broken, it should make one clip take a little longer to appear.
 *
 * Retries and backoff are BullMQ's (see FINALISE_ATTEMPTS). Failing the job by
 * throwing is what schedules the next attempt; only the final attempt writes
 * FAILED, which is what `onFailed` below is for.
 */
@Processor(MEDIA_QUEUE)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<FinaliseClipJob>): Promise<void> {
    if (job.name !== FINALISE_CLIP_JOB) return;
    const { mediaId, storageKey, posterKey } = job.data;

    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, status: true, playerId: true },
    });

    // Deleted, or already answered. Both are ordinary: a player can remove a
    // clip while its job is queued, and a retry can land after a success.
    if (!media || media.status !== 'PROCESSING') return;

    const object = await this.storage.describeObject(storageKey);

    if (!object) {
      // Thrown, not written: this schedules the next attempt, and the upload may
      // simply still be in flight. `onFailed` writes FAILED once the attempts
      // are spent.
      throw new Error('The uploaded file has not arrived in storage yet');
    }

    if (object.size === 0) {
      await this.fail(mediaId, 'The uploaded file was empty.');
      return;
    }

    if (object.size > MAX_CLIP_BYTES) {
      // The browser checks this too, but a presigned URL will accept whatever is
      // sent to it — this is the check that binds.
      await this.fail(mediaId, 'That file is larger than the 120 MB limit.');
      return;
    }

    if (object.contentType && !object.contentType.startsWith('video/')) {
      await this.fail(mediaId, 'That upload is not a video.');
      return;
    }

    // The cover is optional by design (capture can fail in the browser), so a
    // missing one is dropped rather than failing the clip: a video without a
    // thumbnail is far better than a refused upload.
    const posterPresent = posterKey ? await this.storage.describeObject(posterKey) : null;

    await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'ACTIVE',
        sizeBytes: object.size,
        failureReason: null,
        processedAt: new Date(),
        ...(posterKey && !posterPresent ? { posterKey: null } : {}),
      },
    });

    // The profile read embeds active media, so its cache is now stale — the same
    // invalidation confirmUpload used to do, moved to the moment the clip
    // actually becomes visible.
    await this.redis.del(RedisKeys.playerProfile(media.playerId));

    this.logger.log(`Clip ${mediaId} is ready (${object.size} bytes)`);
  }

  /**
   * Called once BullMQ has spent every attempt.
   *
   * This is where FAILED is written, rather than inside `process`: a failure on
   * attempt two is a retry, and marking the clip failed there would tell the
   * player it was lost seconds before it arrived.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<FinaliseClipJob>, error: Error) {
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    this.logger.warn(`Clip ${job.data.mediaId} gave up after ${job.attemptsMade}: ${error.message}`);
    await this.fail(
      job.data.mediaId,
      'We could not find your uploaded file. Please try uploading it again.',
    ).catch((writeError: unknown) => {
      // Nothing above this catches, and a throw here is an unhandled rejection
      // in a worker — logged instead, so a database blip cannot take the process
      // down over a status write.
      this.logger.error(
        `Could not mark clip ${job.data.mediaId} failed: ${
          writeError instanceof Error ? writeError.message : writeError
        }`,
      );
    });
  }

  /** Records the verdict, leaving anything already decided alone. */
  private async fail(mediaId: string, reason: string) {
    await this.prisma.media.updateMany({
      where: { id: mediaId, status: 'PROCESSING' },
      data: { status: 'FAILED', failureReason: reason, processedAt: new Date() },
    });
  }
}
