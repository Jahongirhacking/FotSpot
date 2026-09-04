/**
 * The small, pure pieces of "a job went wrong": how it is logged, how a hung
 * step is turned into a failed one, and how a stalled job is recognised.
 *
 * DI-free on purpose (backend/CLAUDE.md §2), so the log line's shape and the
 * timeout's behaviour are asserted without a worker or a queue.
 */

export interface ProcessingFailure {
  mediaId: string;
  playerId?: string | null;
  /** The job name, or a finer step inside it ('transcode', 'finalise', 'restart'). */
  step: string;
  error: string;
  /** Attempts made so far on this job, and how many it was allowed. */
  attempt?: number;
  attempts?: number;
  /** Whether this was the last attempt, i.e. whether the row was marked. */
  final?: boolean;
  at?: Date;
}

/**
 * One line per failure, every field the person reading the log will want,
 * in `key=value` form so it greps.
 *
 * The timestamp is repeated although the logger adds one: this line is what
 * gets pasted into a ticket, and a pasted line has lost the logger's prefix.
 */
export function processingFailureLine(failure: ProcessingFailure): string {
  const attempt =
    failure.attempt !== undefined ? ` attempt=${failure.attempt}/${failure.attempts ?? '?'}` : '';
  return (
    `[MEDIA_PROCESSING_FAILED] mediaId=${failure.mediaId} ` +
    `playerId=${failure.playerId ?? 'unknown'} step=${failure.step}${attempt} ` +
    `final=${failure.final ?? false} error=${JSON.stringify(failure.error)} ` +
    `at=${(failure.at ?? new Date()).toISOString()}`
  );
}

/**
 * The promise, or a rejection once `ms` have passed — whichever is first.
 *
 * The underlying work is not cancelled (a promise cannot be), so a step that
 * has genuinely hung keeps hanging in the background; what changes is that the
 * *job* fails, which schedules a retry and eventually a verdict, instead of
 * staying active until the process is restarted.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${step} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * BullMQ's own message for a job whose worker stopped renewing the lock — a
 * crash, a deploy, an OOM kill — repeated past `maxStalledCount`. Nothing about
 * the clip has been established, so the response is a restart, not a verdict.
 */
export function isStalledError(error: { message?: string } | undefined): boolean {
  return /stalled/i.test(error?.message ?? '');
}

export function isTimeoutError(error: { message?: string } | undefined): boolean {
  return /timed out/i.test(error?.message ?? '');
}
