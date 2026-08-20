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
}

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
