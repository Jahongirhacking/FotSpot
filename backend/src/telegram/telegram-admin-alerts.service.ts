import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { adminAlertMessage, AdminAlert } from './telegram.messages';
import {
  SEND_ADMIN_ALERT_JOB,
  SEND_ATTEMPTS,
  SEND_BACKOFF_MS,
  TELEGRAM_QUEUE,
  TelegramJob,
} from './telegram.constants';

/**
 * Tells the platform's operator, on Telegram, that something grew.
 *
 * ## What this is and is not
 *
 * A signup and a fresh clip are the platform's pulse, and the operator asked to
 * feel it in the chat they already live in. This is *operational* awareness, not
 * a user notification: there is no Notification row, no in-app copy, no
 * preference toggle — the recipient is a chat id in configuration, not an
 * account that linked Telegram. That is why it does not go through
 * `NotificationsService.notify`, whose contract (persist + socket + per-user
 * consent) is about users.
 *
 * ## Where the chat id comes from
 *
 * `TELEGRAM_ADMIN_CHAT_ID`, next to the bot token it depends on. Configuration
 * rather than code because it is an operator's address, not a property of the
 * product — a staging deployment points it at a test chat or leaves it unset,
 * and unset means this whole service is a silent no-op, exactly like an unset
 * bot token.
 *
 * ## Nothing here can fail the thing it reports
 *
 * The same contract as `TelegramNotificationsService.enqueue`, for the same
 * reason: by the time this runs the signup is committed or the clip row is
 * written. An alert about a success must not be able to turn that success into
 * a failed request — so `announce` never throws, and delivery itself happens on
 * the queue with the ordinary retry budget.
 */
@Injectable()
export class TelegramAdminAlertsService {
  private readonly logger = new Logger(TelegramAdminAlertsService.name);

  constructor(
    private config: ConfigService,
    @InjectQueue(TELEGRAM_QUEUE) private queue: Queue<TelegramJob>,
  ) {}

  /** The operator's chat, or null when this deployment has not named one. */
  private get chatId(): string | null {
    const value = this.config.get<string>('TELEGRAM_ADMIN_CHAT_ID')?.trim();
    return value ? value : null;
  }

  /**
   * Queues one alert for the operator. Never throws, returns nothing.
   *
   * Callers do not await this for correctness — they may not await it at all.
   * The text is built here, at enqueue time, so the worker stays a dumb pipe
   * and the wording lives beside the other Telegram wording in
   * `telegram.messages.ts`.
   */
  async announce(alert: AdminAlert): Promise<void> {
    const chatId = this.chatId;
    if (!chatId) return;

    try {
      await this.queue.add(
        SEND_ADMIN_ALERT_JOB,
        { chatId, text: adminAlertMessage(alert) },
        {
          attempts: SEND_ATTEMPTS,
          backoff: { type: 'exponential', delay: SEND_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      // Redis being down is the only way here, and the signup or upload this
      // describes has already succeeded. Logged and dropped.
      this.logger.warn(`Could not queue an operator alert (${alert.kind}): ${error}`);
    }
  }
}
