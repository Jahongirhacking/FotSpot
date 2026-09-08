/**
 * The trials queue: one job, the settlement of a verdict.
 *
 * ## Why a verdict is settled later rather than at once
 *
 * A coach at the side of a pitch presses PASS with a thumb, and sometimes the
 * wrong thumb. The verdict itself is cheap to reverse — a row and a status —
 * but what follows it is not: the scouts behind the player are settled, the
 * player's recommendations are cleared, and a fourteen-year-old gets a text
 * message saying they passed. None of that can be unsent. So the verdict is
 * written immediately, the screen updates immediately, and the consequences
 * run after a short window in which the coach may take it back. Undo inside
 * the window removes the delayed job and the verdict; after it, the verdict
 * has gone out and stands.
 *
 * A BullMQ delayed job rather than a timer in the process, so the settlement
 * survives a restart — a verdict whose consequences quietly never ran would be
 * a scout never paid for a right call.
 */
export const TRIALS_QUEUE = 'trials';

export const SETTLE_VERDICT_JOB = 'settle-verdict';

/**
 * How long a coach has to undo. Long enough to notice and reach the button,
 * short enough that a verdict is not "pending" in any sense anybody waits on.
 */
export const VERDICT_UNDO_WINDOW_MS = 30_000;

/** Attempts before a settlement is left for the boot-time sweep to retry. */
export const SETTLE_ATTEMPTS = 5;
export const SETTLE_BACKOFF_MS = 5_000;

export interface SettleVerdictJob {
  applicationId: string;
}

/**
 * One settlement per application, so an undo knows exactly which job to
 * remove. A hyphen, not a colon: BullMQ reserves `:` in custom ids.
 */
export const settleJobId = (applicationId: string) => `settle-verdict-${applicationId}`;

/**
 * The same idle tuning as the media and Telegram workers, for the same reason:
 * BullMQ polls, and an idle worker at the defaults costs Redis commands for
 * nothing. `drainDelay` only decides how long the worker blocks on an empty
 * queue — a delayed job coming due still wakes it on time.
 */
export const IDLE_TUNING = {
  drainDelay: 60,
  stalledInterval: 300_000,
} as const;
