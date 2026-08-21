import { NotificationEvent } from '@prisma/client';

/** The queue Telegram deliveries run on. Separate from `media-processing`. */
export const TELEGRAM_QUEUE = 'telegram-delivery';

export const SEND_NOTIFICATION_JOB = 'send-notification';

/**
 * What a delivery job carries.
 *
 * The Telegram id rather than the FotSpot user id, and the event and payload
 * rather than the notification id — so the worker needs no database read at all
 * on the happy path. The row it would have re-read cannot change between
 * enqueue and delivery in any way that alters the message.
 *
 * The user id is carried too, but only so a failure can be logged against an
 * account without a lookup.
 */
export interface SendNotificationJob {
  userId: string;
  telegramId: string;
  event: NotificationEvent;
  payload: Record<string, unknown>;
}

/**
 * How hard the worker asks "anything for me yet?".
 *
 * The same numbers, and the same reasoning, as `MediaProcessor`'s `IDLE_TUNING`:
 * BullMQ polls, and a default worker costs roughly 110 Redis commands a minute
 * while completely idle. A second queue would double that bill for no benefit,
 * which on a per-command Redis plan is the difference between a rounding error
 * and a real line item.
 *
 * Neither number affects real work: `drainDelay` is only how long the worker
 * blocks on an *empty* queue — a job pushed while it waits wakes it at once —
 * and nobody is waiting on the stalled sweep for a notification whose in-app
 * copy was delivered before this job was even created.
 */
export const IDLE_TUNING = {
  drainDelay: 60,
  stalledInterval: 300_000,
} as const;

/**
 * Attempts before a delivery is given up on.
 *
 * Three, with backoff, because the failures worth retrying are transient by
 * definition — a 429 from Telegram's rate limiter, a 5xx, a dropped connection.
 * Anything permanent (blocked bot, chat gone) is not retried at all: the worker
 * turns the preference off and returns, so those never reach this budget.
 */
export const SEND_ATTEMPTS = 3;
export const SEND_BACKOFF_MS = 10_000;
