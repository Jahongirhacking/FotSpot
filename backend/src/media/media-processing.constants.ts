/**
 * The media processing queue — README §1.19 (Redis) and §1.20 (scaling).
 *
 * Names live in their own module so the producer (`MediaService`), the consumer
 * (`MediaProcessor`) and the module wiring all read the same string. A queue
 * name that only agrees by coincidence is a job that is enqueued and never run,
 * which looks exactly like a worker that is down.
 */
export const MEDIA_QUEUE = 'media-processing';

export const FINALISE_CLIP_JOB = 'finalise-clip';

/**
 * Transcoding, for a clip the browser could not compress.
 *
 * A separate job kind rather than a flag on the first, because the work is not
 * comparable: finalising is two HEAD requests, transcoding is minutes of CPU and
 * a file on disk. One name each keeps them separable in the queue's own metrics
 * and lets a future deployment give transcoding its own worker without touching
 * the producer.
 */
export const TRANSCODE_CLIP_JOB = 'transcode-clip';

export interface FinaliseClipJob {
  mediaId: string;
  /** Denormalised so the worker's first act is not a database read. */
  storageKey: string;
  posterKey?: string | null;
  /**
   * For the failure log, which has to name the player without a read that may
   * itself be the thing failing. Optional: jobs queued before this field existed
   * are still in flight somewhere.
   */
  playerId?: string;
}

/**
 * The sweep that finds clips PROCESSING with nothing behind them.
 *
 * ## Why a queue job and not a timer
 *
 * A `setInterval` in the API runs once per instance, and every instance would
 * sweep the same rows. A BullMQ job scheduler is one entry in Redis however many
 * processes are up, it uses the worker this queue already has, and it costs a
 * handful of commands every ten minutes against a budget that was worried about
 * a hundred a minute.
 */
export const SWEEP_STALE_JOB = 'sweep-stale-processing';
export const SWEEP_SCHEDULER_ID = 'media-stale-sweep';
export const STALE_SWEEP_EVERY_MS = 10 * 60 * 1000;

/**
 * How long a clip may sit at PROCESSING before the sweep asks whether anything
 * is still working on it. Overridable with MEDIA_PROCESSING_STALE_MINUTES.
 *
 * Longer than the slowest honest run: a transcode is bounded at ten minutes
 * (below) and a file that never arrives is given up on after about two. A row
 * older than this whose job is still queued or active is left alone; one with
 * no live job is restarted.
 */
export const DEFAULT_STALE_AFTER_MINUTES = 30;

/**
 * How many times the sweep (or an admin) may restart processing before the
 * clip is marked FAILED. Persisted as `Media.processingAttempts`, because the
 * whole point is a bound that survives the job — and the process — being gone.
 */
export const MAX_PROCESSING_RESTARTS = 3;

/** What the uploader reads once the restarts are spent. */
export const PROCESSING_GAVE_UP_REASON =
  'Processing did not complete after several attempts. Please try uploading it again.';

/**
 * Ceilings on one attempt's steps, so a hung call fails the attempt instead of
 * holding a job active for ever.
 *
 * The S3 client has no request timeout of its own, so a download that stops
 * receiving bytes never ends; BullMQ keeps renewing the lock on a job whose
 * worker is alive, so nothing outside notices. The transcode bound sits above
 * ffmpeg's own four-minute kill plus a download and an upload of a 120 MB file.
 */
export const TRANSCODE_STEP_TIMEOUT_MS = 10 * 60 * 1000;
export const FINALISE_STEP_TIMEOUT_MS = 60 * 1000;

/** Thrown by the worker to schedule the next look for a file still in flight. */
export const NOT_ARRIVED_ERROR = 'The uploaded file has not arrived in storage yet';

/**
 * How long a transcode may hold a queue slot, and how often it is retried.
 *
 * Fewer attempts than finalising, and no reason to back off far: finalising
 * retries a *race* that resolves itself, where a transcode that failed has
 * usually failed for a reason repeating will not fix. Two attempts covers a
 * transient download.
 */
export const TRANSCODE_ATTEMPTS = 2;
export const TRANSCODE_BACKOFF_MS = 15_000;

/**
 * Attempts, and the wait between them.
 *
 * The failure this retries is a race, not a bug: the browser's PUT to R2 and its
 * confirm call to the API are two separate requests, and on a slow connection the
 * confirm can arrive while the upload is still finishing. A first check a few
 * seconds later, then backing off to roughly a minute, covers a large video on a
 * poor connection without holding a worker slot open.
 *
 * Five attempts across about two minutes. Beyond that the object is not late,
 * it is absent.
 */
export const FINALISE_ATTEMPTS = 5;
export const FINALISE_BACKOFF_MS = 5_000;

/**
 * Ceiling on a stored clip, checked against what the bucket reports.
 *
 * The browser enforces the same limit before uploading, which is a courtesy to
 * the user rather than a control: a presigned PUT is a URL, and whoever holds it
 * can send whatever they like to it. This is the check that is actually binding,
 * and it is why it runs against `ContentLength` from the bucket instead of a
 * number the client sent.
 */
export const MAX_CLIP_BYTES = 120 * 1024 * 1024;

/**
 * The fallback's retry shape, used when the queue cannot be reached.
 *
 * Deliberately shorter than the queue's five attempts across two minutes: this
 * runs in the web process rather than a worker, so the window it holds a timer
 * open for is a cost the API pays. Three tries over about twenty seconds covers
 * the ordinary race between the browser's upload finishing and its confirm
 * arriving, which is the only thing the delay is for.
 */
export const INLINE_FINALISE_ATTEMPTS = 3;
export const INLINE_FINALISE_DELAY_MS = 10_000;
