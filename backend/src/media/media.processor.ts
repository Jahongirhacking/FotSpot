import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MediaFinaliserService } from './media-finaliser.service';
import { MediaRecoveryService } from './media-recovery.service';
import {
  FINALISE_CLIP_JOB,
  FINALISE_STEP_TIMEOUT_MS,
  MEDIA_QUEUE,
  NOT_ARRIVED_ERROR,
  SWEEP_STALE_JOB,
  TRANSCODE_CLIP_JOB,
  TRANSCODE_STEP_TIMEOUT_MS,
  type FinaliseClipJob,
} from './media-processing.constants';
import {
  isStalledError,
  isTimeoutError,
  processingFailureLine,
  withTimeout,
} from './processing-failure.util';
import { VideoTranscoderService } from './video-transcoder.service';

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
 * ## PROCESSING always ends
 *
 * Retries and backoff are BullMQ's (see FINALISE_ATTEMPTS / TRANSCODE_ATTEMPTS).
 * Failing the job by throwing is what schedules the next attempt; `onFailed`
 * below is what writes FAILED once the attempts are spent — and it is the part
 * that went missing in a refactor, which is how clips came to sit at
 * PROCESSING for a day. Each step is also bounded in time, so a hung download
 * fails the attempt rather than holding the job active, and a job whose worker
 * died is restarted (bounded) rather than dropped. What no attempt can reach,
 * the sweep does: `MediaRecoveryService` reconciles the table with the queue
 * every ten minutes.
 */
/**
 * How hard the worker is allowed to ask "anything for me yet?".
 *
 * ## These numbers are a bill, not a tuning preference
 *
 * BullMQ polls. With nothing queued at all the default worker still issued
 * about 110 Redis commands a minute — a blocking pop that times out every five
 * seconds, a stalled-job sweep every thirty, and the script calls each of those
 * drags along. On a Redis you own that is free and invisible. On a per-command
 * plan it is ~176,000 commands a day to do nothing, which is a 500,000/month
 * allowance gone in under three days before a single person signs in.
 *
 * ## What we give up
 *
 * `drainDelay` is only how long the worker blocks *when the queue is empty* —
 * a job pushed while it waits wakes it immediately, so throughput and latency
 * for real work are unchanged. `stalledInterval` is how quickly a job orphaned
 * by a crashed worker is noticed; five minutes rather than thirty seconds is
 * the actual cost here, and this queue confirms uploads that already carry
 * their own retries (FINALISE_ATTEMPTS). Nobody is waiting on that sweep.
 */
const IDLE_TUNING = {
  /** Seconds the worker blocks on an empty queue. Default is 5. */
  drainDelay: 60,
  /** Milliseconds between stalled-job sweeps. Default is 30_000. */
  stalledInterval: 300_000,
} as const;

/** What the uploader reads, by what went wrong. */
const NOT_FOUND_REASON = 'We could not find your uploaded file. Please try uploading it again.';
const TIMED_OUT_REASON = 'Processing this video took too long. Please try uploading it again.';
const GENERIC_REASON = 'We could not process this video. Please try uploading it again.';

@Processor(MEDIA_QUEUE, IDLE_TUNING)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private finaliser: MediaFinaliserService,
    private transcoder: VideoTranscoderService,
    private recovery: MediaRecoveryService,
  ) {
    super();
  }

  async process(job: Job<FinaliseClipJob>): Promise<void> {
    if (job.name === SWEEP_STALE_JOB) {
      await this.recovery.sweep();
      return;
    }

    /*
     * Transcoding, for a clip the browser could not compress.
     *
     * The clip is already in the bucket as the player's original, and it stays
     * PROCESSING — and therefore invisible to everyone but its uploader — until
     * this has run. A file ffmpeg cannot read is marked FAILED; a host with no
     * ffmpeg at all keeps the original, which the finaliser still bounds by size.
     */
    if (job.name === TRANSCODE_CLIP_JOB) {
      const outcome = await withTimeout(
        this.transcoder.transcodeInPlace(job.data.mediaId, job.data.storageKey),
        TRANSCODE_STEP_TIMEOUT_MS,
        'transcode',
      );
      /*
       * Only a verdict about the file stops here — `transcodeInPlace` has
       * already written FAILED with a reason the uploader can read. A host that
       * cannot transcode is not that: the clip is kept as uploaded and goes on to
       * be finalised and moderated like any other, so a missing binary shows up
       * in the logs and never on a player's card.
       */
      if (outcome === 'FAILED') return;
    }

    if (job.name !== FINALISE_CLIP_JOB && job.name !== TRANSCODE_CLIP_JOB) return;

    // The decision lives in MediaFinaliserService so that a clip can still be
    // finalised when there is no queue to run this — see that class's note.
    const outcome = await withTimeout(
      this.finaliser.finalise(job.data),
      FINALISE_STEP_TIMEOUT_MS,
      'finalise',
    );

    if (outcome === 'NOT_ARRIVED') {
      // Thrown, not written: this schedules the next attempt, and the upload may
      // simply still be in flight. `onFailed` writes FAILED once the attempts
      // are spent.
      throw new Error(NOT_ARRIVED_ERROR);
    }
  }

  /**
   * Every failed attempt is logged; the last one is written to the row.
   *
   * A stalled job is the exception — its worker died rather than its clip being
   * wrong — so it is restarted through the recovery service, which bounds how
   * many times that may happen before the clip is failed after all.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<FinaliseClipJob> | undefined, error: Error) {
    if (!job) return;
    if (job.name === SWEEP_STALE_JOB) {
      this.logger.warn(`The stale-processing sweep failed: ${error.message}`);
      return;
    }

    const attempts = job.opts.attempts ?? 1;
    const stalled = isStalledError(error);
    const final = stalled || job.attemptsMade >= attempts;

    this.logger.error(
      processingFailureLine({
        mediaId: job.data.mediaId,
        playerId: job.data.playerId,
        step: job.name,
        error: error.message,
        attempt: job.attemptsMade,
        attempts,
        final,
      }),
    );
    if (!final) return;

    try {
      if (stalled) {
        await this.recovery.restartById(job.data.mediaId, 'stalled');
        return;
      }
      await this.finaliser.fail(job.data.mediaId, reasonFor(error));
    } catch (writeError) {
      // The one failure this cannot recover from itself; the sweep will.
      this.logger.error(
        `Could not mark ${job.data.mediaId} after its last attempt: ${(writeError as Error).message}`,
      );
    }
  }
}

function reasonFor(error: Error): string {
  if (error.message === NOT_ARRIVED_ERROR) return NOT_FOUND_REASON;
  if (isTimeoutError(error)) return TIMED_OUT_REASON;
  return GENERIC_REASON;
}
