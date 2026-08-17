import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisKeys } from '../redis/redis.keys';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { MAX_CLIP_BYTES, type FinaliseClipJob } from './media-processing.constants';

/**
 * What happens to a clip after the browser says it uploaded one.
 *
 * ## Why this is not in the processor any more
 *
 * It used to be the body of `MediaProcessor.process`, which made BullMQ — and
 * therefore Redis — a hard requirement for a clip to ever become visible. When
 * the queue could not be reached the row sat at PROCESSING for good: the upload
 * had worked, the file was in the bucket, and the player was looking at a clip
 * that never appeared.
 *
 * The decision itself needs nothing but Postgres and the bucket. Splitting it
 * out lets the worker call it on the happy path and `MediaService` call it
 * directly when there is no worker to hand, so Redis is an accelerator rather
 * than a dependency.
 *
 * ## The outcome is returned, not thrown
 *
 * `NOT_ARRIVED` is the one case that is not a verdict — the PUT to R2 and the
 * confirm call to the API are separate requests and the second can win the race.
 * Returning it lets each caller decide: the worker throws to schedule BullMQ's
 * next attempt, the inline path waits and asks again.
 */
export type FinaliseOutcome = 'ACTIVE' | 'FAILED' | 'NOT_ARRIVED' | 'GONE';

@Injectable()
export class MediaFinaliserService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private redis: RedisService,
  ) {}

  async finalise({ mediaId, storageKey, posterKey }: FinaliseClipJob): Promise<FinaliseOutcome> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, status: true, playerId: true },
    });

    // Deleted, or already answered. Both are ordinary: a player can remove a
    // clip while its job is queued, and a retry can land after a success.
    if (!media || media.status !== 'PROCESSING') return 'GONE';

    const object = await this.storage.describeObject(storageKey);
    if (!object) return 'NOT_ARRIVED';

    if (object.size === 0) {
      await this.fail(mediaId, 'The uploaded file was empty.');
      return 'FAILED';
    }

    if (object.size > MAX_CLIP_BYTES) {
      // The browser checks this too, but a presigned URL will accept whatever is
      // sent to it — this is the check that binds.
      await this.fail(mediaId, 'That file is larger than the 120 MB limit.');
      return 'FAILED';
    }

    if (object.contentType && !object.contentType.startsWith('video/')) {
      await this.fail(mediaId, 'That upload is not a video.');
      return 'FAILED';
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

    // The profile read embeds active media, so its cache is now stale — cleared
    // at the moment the clip actually becomes visible. Failing soft already, so
    // an unreachable Redis cannot undo the work above.
    await this.redis.del(RedisKeys.playerProfile(media.playerId));
    return 'ACTIVE';
  }

  /** Only ever from PROCESSING, so a verdict cannot overwrite a later one. */
  async fail(mediaId: string, reason: string) {
    await this.prisma.media.updateMany({
      where: { id: mediaId, status: 'PROCESSING' },
      data: { status: 'FAILED', failureReason: reason, processedAt: new Date() },
    });
  }
}
