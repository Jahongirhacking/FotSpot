/**
 * The invitations queue: one job, the settlement of an accepted invitation.
 *
 * ## Why a yes is settled later rather than at once
 *
 * Accepting an academy's invitation is one press on a phone, and it is a big
 * one: it writes the membership, tells the manager, and — for a player moving
 * between academies — releases them from the club they were at. None of that
 * unwinds cleanly, and a Telegram message to a manager cannot be unsent. So
 * the answer is recorded immediately and the screen says so, but the
 * consequences run after a short window in which the person may take it
 * back. Undo inside the window removes the job and returns the invitation to
 * unanswered; after it, the yes stands. The same shape as a trial verdict —
 * see trials.constants.ts.
 *
 * A BullMQ delayed job rather than a timer in the process, so a restart does
 * not lose a membership somebody was promised.
 */
export const INVITATIONS_QUEUE = 'invitations';

export const SETTLE_ACCEPTANCE_JOB = 'settle-acceptance';

/** How long the person has to undo. */
export const ACCEPT_UNDO_WINDOW_MS = 30_000;

export const SETTLE_ATTEMPTS = 5;
export const SETTLE_BACKOFF_MS = 5_000;

export interface SettleAcceptanceJob {
  invitationId: string;
}

/** One settlement per invitation, so an undo knows which job to remove. No colon: BullMQ reserves it. */
export const settleJobId = (invitationId: string) => `settle-acceptance-${invitationId}`;

/** See the media and Telegram workers for why an idle worker is tuned down. */
export const IDLE_TUNING = {
  drainDelay: 60,
  stalledInterval: 300_000,
} as const;
