import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MediaFinaliserService } from './media-finaliser.service';
import {
  FINALISE_CLIP_JOB,
  MEDIA_QUEUE,
  TRANSCODE_CLIP_JOB,
  type FinaliseClipJob,
} from './media-processing.constants';
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
 * Retries and backoff are BullMQ's (see FINALISE_ATTEMPTS). Failing the job by
 * throwing is what schedules the next attempt; only the final attempt writes
 * FAILED, which is what `onFailed` below is for.
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

@Processor(MEDIA_QUEUE, IDLE_TUNING)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private finaliser: MediaFinaliserService,
    private transcoder: VideoTranscoderService,
  ) {
    super();
  }

  async process(job: Job<FinaliseClipJob>): Promise<void> {
    /*
     * Transcoding, for a clip the browser could not compress.
     *
     * The clip is already in the bucket as the player's original, and it stays
     * PROCESSING — and therefore invisible to everyone but its uploader — until
     * this has replaced it with the optimised version. A failure marks it FAILED
     * rather than letting the original through: an unoptimised clip is not
     * merely large, it is not the file this feed serves.
     */
    if (job.name === TRANSCODE_CLIP_JOB) {
      const optimised = await this.transcoder.transcodeInPlace(
        job.data.mediaId,
        job.data.storageKey,
      );
      // `transcodeInPlace` has already written FAILED with a reason the uploader
      // can read, so this only decides whether to finalise.
      if (!optimised) return;
    }

    if (job.name !== FINALISE_CLIP_JOB && job.name !== TRANSCODE_CLIP_JOB) return;

    // The decision lives in MediaFinaliserService so that a clip can still be
    // finalised when there is no queue to run this — see that class's note.
    const outcome = await this.finaliser.finalise(job.data);

    if (outcome === 'NOT_ARRIVED') {
      // Thrown, not written: this schedules the next attempt, and the upload may
      // simply still be in flight. `onFailed` writes FAILED once the attempts
      // are spent.
      throw new Error('The uploaded file has not arrived in storage yet');
    }
  }

  private async fail(mediaId: string, reason: string) {
    await this.finaliser.fail(mediaId, reason);
  }
}
