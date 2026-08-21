import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { notificationMessage, notificationPath } from './telegram.messages';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramService } from './telegram.service';
import {
  IDLE_TUNING,
  SendNotificationJob,
  TELEGRAM_QUEUE,
} from './telegram.constants';

/**
 * Delivers the Telegram copy of a notification, off the request path.
 *
 * ## Why a queue and not a fire-and-forget call
 *
 * `TrialsService` sends its PASS SMS with a floating promise, and that is right
 * *there*: a trial verdict is rare and deliberate. Notifications are neither —
 * they fire on recommendations, reviews, invitations, trial publications, squad
 * changes, and one action can produce many at once. A floating `fetch` per
 * notification means an unbounded number of in-flight sockets held by a process
 * whose request has already returned, no retry when Telegram rate-limits (which
 * it does, per chat), and nothing surviving a restart.
 *
 * The queue was already here for media, so this is a second queue on existing
 * infrastructure rather than new infrastructure — which is what §14 asks for.
 *
 * ## What counts as a failure
 *
 * Only the retryable kind throws. `unreachable` is a *successful* job: it has
 * established that Telegram will not carry this message, and no number of
 * retries changes that — throwing would burn three attempts to relearn one
 * permanent fact. It does not touch the person's preference either; see the
 * comment at that branch.
 */
@Processor(TELEGRAM_QUEUE, IDLE_TUNING)
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name);

  constructor(
    private telegram: TelegramService,
    private notifications: TelegramNotificationsService,
  ) {
    super();
  }

  async process(job: Job<SendNotificationJob>): Promise<void> {
    const { telegramId, event, payload } = job.data;

    const origin = this.notifications.publicUrl;
    if (!origin) {
      /*
       * No origin, no link, and a notification that says only "you have a new
       * notification" with no way to reach it is not worth a push.
       *
       * Returning rather than throwing: retrying cannot fix a missing
       * environment variable, and three attempts per notification would turn a
       * deployment oversight into a queue full of guaranteed failures.
       */
      this.logger.warn(
        'APP_PUBLIC_URL is not set, so a Telegram notification would carry no usable link. Skipped.',
      );
      return;
    }

    const text = notificationMessage({
      url: `${origin}${notificationPath(event, payload)}`,
      headline: HEADLINE,
    });

    const result = await this.telegram.send(telegramId, text);

    if (result.status === 'unreachable') {
      /*
       * Blocked, never started, or the account is gone. Not retried — three
       * attempts would relearn the same permanent fact — and, deliberately, the
       * person's preference is **not** turned off either.
       *
       * Flipping it would fight the setting they chose: the screen would show
       * notifications off, they would switch them back on, the next delivery
       * would fail and flip them off again, with nothing anywhere explaining
       * why. The preference records what they asked for; whether Telegram will
       * carry it is Telegram's business, and it changes the moment they press
       * /start. The cost is one refused API call per notification for somebody
       * who never opened the bot, which is bounded and logged.
       */
      this.logger.log(
        `Telegram chat for user ${job.data.userId} is unreachable (${result.reason}); ` +
          'the message was dropped. They most likely have not started the bot.',
      );
      return;
    }

    if (result.status === 'failed') {
      // Throwing is what schedules the next attempt — BullMQ's retry, the same
      // arrangement `MediaProcessor` uses.
      throw new Error(`Telegram delivery failed: ${result.reason}`);
    }

    // `sent` and `unconfigured` are both nothing-more-to-do. `unconfigured`
    // should not reach here (the queue is only fed when a bot is wired up) but
    // it is not a failure if it does.
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SendNotificationJob> | undefined, error: Error) {
    /*
     * Logged at the end of the retries, and that is all.
     *
     * There is no compensating action to take: the notification itself was
     * delivered in-app the moment it was created, so a Telegram copy that never
     * arrived is a degraded extra rather than lost information.
     */
    if ((job?.attemptsMade ?? 0) < (job?.opts?.attempts ?? 1)) return;
    this.logger.warn(
      `Gave up on a Telegram notification for user ${job?.data?.userId}: ${error.message}`,
    );
  }
}

/**
 * The one line every Telegram push carries.
 *
 * Event-neutral on purpose. The in-app list renders each event from its payload
 * in the reader's own language on the client (`lib/notifications.ts`); writing
 * per-event sentences here would be a second, server-side, single-language copy
 * of that logic, and the two would disagree the first time either changed. This
 * is a nudge to open the app, and the app says what happened.
 */
const HEADLINE = "Sizda yangi bildirishnoma bor.";
