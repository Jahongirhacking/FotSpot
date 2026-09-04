import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { JobState, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MediaFinaliserService } from './media-finaliser.service';
import {
  DEFAULT_STALE_AFTER_MINUTES,
  MAX_PROCESSING_RESTARTS,
  MEDIA_QUEUE,
  PROCESSING_GAVE_UP_REASON,
  STALE_SWEEP_EVERY_MS,
  SWEEP_SCHEDULER_ID,
  SWEEP_STALE_JOB,
  TRANSCODE_ATTEMPTS,
  TRANSCODE_BACKOFF_MS,
  TRANSCODE_CLIP_JOB,
  type FinaliseClipJob,
} from './media-processing.constants';
import { processingFailureLine } from './processing-failure.util';

/**
 * What the queue says about a clip's job, in terms the rest of the code and
 * the admin screen can use.
 *
 * `live` is the question everything here asks: is *anything* still going to
 * write a verdict on this row? A job that is waiting, delayed or active will.
 * One that is completed, failed, or simply not there will not — and a row still
 * PROCESSING behind one of those is stuck.
 */
export interface JobLiveness {
  state: JobState | 'none' | 'unknown';
  live: boolean;
  attemptsMade: number | null;
  failedReason: string | null;
}

export type RestartOutcome = 'RESTARTED' | 'RUNNING' | 'FAILED' | 'GONE' | 'UNAVAILABLE';

/** The columns a restart needs, and nothing that would make it a bigger read. */
export interface RecoverableClip {
  id: string;
  playerId: string;
  storageKey: string;
  posterKey: string | null;
  processingAttempts: number;
}

const RECOVERABLE_SELECT = {
  id: true,
  playerId: true,
  storageKey: true,
  posterKey: true,
  status: true,
  processingAttempts: true,
} as const;

const LIVE_STATES: ReadonlySet<string> = new Set([
  'active',
  'waiting',
  'delayed',
  'prioritized',
  'waiting-children',
]);

/** How many stale rows one sweep looks at. A backlog is cleared over a few sweeps. */
const SWEEP_BATCH = 100;

export interface SweepSummary {
  examined: number;
  restarted: number;
  running: number;
  failed: number;
  gone: number;
  unavailable: number;
}

/**
 * Gets a clip out of PROCESSING when nothing else is going to.
 *
 * ## The gap this closes
 *
 * PROCESSING is meant to be a moment: the worker looks in the bucket and writes
 * ACTIVE or FAILED. Every way that moment failed to end left the row exactly
 * where it was, and for months some of those were happening. A job that spent
 * its attempts was marked failed in Redis and purged a day later, but the row
 * was never told (the handler that told it had been deleted in a refactor). A
 * job orphaned by a deploy or an OOM kill stalled, was re-queued once, stalled
 * again, and was dropped. A clip that needed transcoding while Redis was
 * unreachable was never queued at all. None of those rows were listed on any
 * admin screen, so "some videos stay PROCESSING for a day" was the first
 * anyone heard of it.
 *
 * ## Two halves
 *
 * The sweep (`sweep`, run by the worker every ten minutes) reconciles Postgres
 * with the queue: every row PROCESSING longer than the threshold is checked for
 * a live job, and one with none is restarted. The restart (`restart`) is
 * bounded by `Media.processingAttempts` — a count kept on the row precisely
 * because the job it counts may no longer exist — and past the bound the clip
 * is marked FAILED with a reason the uploader can act on.
 *
 * ## Never ACTIVE from here
 *
 * Nothing in this class promotes a clip. A restart re-queues the *same work*
 * the upload queued — transcode, then finalise — and the verdict is whatever
 * that work establishes. ACTIVE still means the file was found and bounded.
 */
@Injectable()
export class MediaRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(MediaRecoveryService.name);
  private readonly staleAfterMinutes: number;

  constructor(
    private prisma: PrismaService,
    private finaliser: MediaFinaliserService,
    @InjectQueue(MEDIA_QUEUE) private queue: Queue,
    config: ConfigService,
  ) {
    const configured = Number(config.get<string>('MEDIA_PROCESSING_STALE_MINUTES'));
    this.staleAfterMinutes =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_AFTER_MINUTES;
  }

  onModuleInit() {
    // Not awaited: with Redis down this can wait on the connection, and an API
    // whose ninety other endpoints do not need the sweep must not wait with it.
    void this.ensureScheduled();
  }

  /**
   * Registers the sweep with the queue. Idempotent, so every instance may call
   * it at boot and there is still one scheduler.
   */
  async ensureScheduled(): Promise<boolean> {
    try {
      await this.queue.upsertJobScheduler(
        SWEEP_SCHEDULER_ID,
        { every: STALE_SWEEP_EVERY_MS },
        {
          name: SWEEP_STALE_JOB,
          data: {},
          // Nothing to inspect on a sweep after the fact; its summary is logged.
          opts: { removeOnComplete: true, removeOnFail: true },
        },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not schedule the stale-processing sweep: ${(error as Error).message}. ` +
          'Until Redis is back, a stuck clip is recovered only by an admin retry.',
      );
      return false;
    }
  }

  /** Whether the queue is still going to answer for this clip. */
  async jobStatus(mediaId: string): Promise<JobLiveness> {
    try {
      const job = await this.queue.getJob(mediaId);
      if (!job) return { state: 'none', live: false, attemptsMade: null, failedReason: null };
      const state = await job.getState();
      return {
        state,
        live: LIVE_STATES.has(state),
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason || null,
      };
    } catch (error) {
      this.logger.warn(`Could not read the job for ${mediaId}: ${(error as Error).message}`);
      return { state: 'unknown', live: false, attemptsMade: null, failedReason: null };
    }
  }

  /**
   * Every clip PROCESSING for longer than the threshold, reconciled with the
   * queue. Rows with a live job are left alone; the rest are restarted, or
   * failed once their restarts are spent.
   */
  async sweep(now = new Date()): Promise<SweepSummary> {
    const cutoff = new Date(now.getTime() - this.staleAfterMinutes * 60_000);
    const rows = await this.prisma.media.findMany({
      where: { status: 'PROCESSING', createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: SWEEP_BATCH,
      select: RECOVERABLE_SELECT,
    });

    const summary: SweepSummary = {
      examined: rows.length,
      restarted: 0,
      running: 0,
      failed: 0,
      gone: 0,
      unavailable: 0,
    };

    for (const row of rows) {
      const job = await this.jobStatus(row.id);
      if (job.live) {
        summary.running += 1;
        continue;
      }
      const outcome = await this.restart(row, `stale with job ${job.state}`);
      if (outcome === 'RESTARTED') summary.restarted += 1;
      else if (outcome === 'RUNNING') summary.running += 1;
      else if (outcome === 'FAILED') summary.failed += 1;
      else if (outcome === 'GONE') summary.gone += 1;
      else summary.unavailable += 1;
    }

    if (rows.length > 0) {
      this.logger.log(
        `[MEDIA_SWEEP] examined=${summary.examined} restarted=${summary.restarted} ` +
          `running=${summary.running} failed=${summary.failed} gone=${summary.gone} ` +
          `unavailable=${summary.unavailable} staleAfter=${this.staleAfterMinutes}m`,
      );
    }
    return summary;
  }

  /** `restart`, for a caller that has only the id (the worker's failed handler). */
  async restartById(mediaId: string, cause: string): Promise<RestartOutcome> {
    const row = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: RECOVERABLE_SELECT,
    });
    if (!row || row.status !== 'PROCESSING') return 'GONE';
    return this.restart(row, cause);
  }

  /**
   * Queues the clip's processing again, or fails it if that has been done
   * enough times already.
   *
   * ## Always the transcode job
   *
   * The row does not record whether the upload was browser-optimised, and the
   * job that knew is gone. Queuing the finalise job alone would publish an
   * unoptimised original for a clip that was waiting to be transcoded — the
   * exact outcome the transcoder exists to prevent. The transcode job is safe
   * for both: an already-optimised clip re-encodes no smaller and is kept as it
   * is (`ORIGINAL_KEPT`), at the cost of one re-encode for a clip that has
   * already gone wrong once.
   *
   * ## The old job is removed first
   *
   * `jobId` is the media id, and BullMQ silently ignores an add whose id already
   * exists — including a job sitting in the failed set for its 24-hour retention.
   * A restart that did not clear it would look like it worked and do nothing.
   */
  async restart(clip: RecoverableClip, cause: string): Promise<RestartOutcome> {
    if (clip.processingAttempts >= MAX_PROCESSING_RESTARTS) {
      this.logger.error(
        processingFailureLine({
          mediaId: clip.id,
          playerId: clip.playerId,
          step: 'restart',
          error: `gave up after ${clip.processingAttempts} restarts (${cause})`,
          attempt: clip.processingAttempts,
          attempts: MAX_PROCESSING_RESTARTS,
          final: true,
        }),
      );
      await this.finaliser.fail(clip.id, PROCESSING_GAVE_UP_REASON);
      return 'FAILED';
    }

    // Claim the restart on the row first, conditionally on it still being
    // PROCESSING: a clip the player deleted, or one the worker answered in the
    // meantime, must not be queued again.
    const { count } = await this.prisma.media.updateMany({
      where: { id: clip.id, status: 'PROCESSING' },
      data: { processingAttempts: { increment: 1 } },
    });
    if (count === 0) return 'GONE';

    const job: FinaliseClipJob = {
      mediaId: clip.id,
      storageKey: clip.storageKey,
      posterKey: clip.posterKey,
      playerId: clip.playerId,
    };

    try {
      const existing = await this.queue.getJob(clip.id);
      if (existing) {
        if (LIVE_STATES.has(await existing.getState())) {
          // Raced by the worker between the liveness check and here.
          await this.unclaim(clip.id);
          return 'RUNNING';
        }
        await existing.remove();
      }
      await this.queue.add(TRANSCODE_CLIP_JOB, job, {
        jobId: clip.id,
        attempts: TRANSCODE_ATTEMPTS,
        backoff: { type: 'exponential', delay: TRANSCODE_BACKOFF_MS },
      });
    } catch (error) {
      // The restart did not happen, so it must not count against the clip.
      await this.unclaim(clip.id);
      this.logger.warn(
        `Could not re-queue processing for ${clip.id} (${cause}): ${(error as Error).message}`,
      );
      return 'UNAVAILABLE';
    }

    this.logger.warn(
      `[MEDIA_RESTART] mediaId=${clip.id} playerId=${clip.playerId} ` +
        `restart=${clip.processingAttempts + 1}/${MAX_PROCESSING_RESTARTS} cause=${JSON.stringify(cause)}`,
    );
    return 'RESTARTED';
  }

  private async unclaim(mediaId: string) {
    await this.prisma.media
      .updateMany({
        where: { id: mediaId, status: 'PROCESSING', processingAttempts: { gt: 0 } },
        data: { processingAttempts: { decrement: 1 } },
      })
      .catch(() => undefined);
  }
}
