import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationEvent } from '@prisma/client';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import {
  SEND_ATTEMPTS,
  SEND_BACKOFF_MS,
  SEND_NOTIFICATION_JOB,
  SendNotificationJob,
  TELEGRAM_QUEUE,
} from './telegram.constants';

/**
 * The bridge between a saved notification and a Telegram message.
 *
 * ## Why this sits between the two rather than inside either
 *
 * `NotificationsService` owns "a notification happened" and must not learn what
 * a bot token is; `TelegramService` owns "send this text to this chat" and must
 * not learn what a notification is. This is the only file that knows both, which
 * is what keeps Telegram out of the notification flow and notifications out of
 * the transport:
 *
 *     NotificationsService → TelegramNotificationsService → queue → TelegramService
 *
 * ## Nothing here can fail a notification
 *
 * `enqueue` is the only method the notification path calls, and it cannot throw:
 * every branch — not linked, not enabled, no queue, Redis down — returns
 * quietly, and the one `await` is wrapped. A notification is already saved and
 * already on the socket by the time this runs, so an exception escaping here
 * would turn a *delivered* notification into a failed request.
 */
@Injectable()
export class TelegramNotificationsService {
  private readonly logger = new Logger(TelegramNotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @InjectQueue(TELEGRAM_QUEUE) private queue: Queue<SendNotificationJob>,
  ) {}

  /**
   * Queues a Telegram copy of a notification, if the recipient wants one.
   *
   * Deliberately returns `void` and never rejects — see the class note. The
   * caller is `NotificationsService.notify`, whose contract is that the
   * notification is saved; this is an extra, and an extra must not be able to
   * take the original down with it.
   */
  async enqueue(
    userId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const recipient = await this.prisma.user.findFirst({
        /*
         * Both conditions, in the query rather than in code after it.
         *
         * `telegramId: { not: null }` is the link; `telegramNotificationsEnabled`
         * is consent *and* reachability (see the schema comment). A row missing
         * either is not a recipient, and asking the database means a user who
         * disconnected a moment ago cannot be selected by a stale value carried
         * in from the caller.
         */
        where: { id: userId, telegramId: { not: null }, telegramNotificationsEnabled: true },
        select: { telegramId: true },
      });

      if (!recipient?.telegramId) return;

      await this.queue.add(
        SEND_NOTIFICATION_JOB,
        { userId, telegramId: recipient.telegramId, event, payload },
        {
          attempts: SEND_ATTEMPTS,
          backoff: { type: 'exponential', delay: SEND_BACKOFF_MS },
          // Nothing reads these afterwards, and a notification queue that keeps
          // every job is one that grows without bound.
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      /*
       * Redis unreachable, the queue refusing, anything at all.
       *
       * Logged and swallowed: the notification this belongs to is already
       * written and already delivered in-app, and losing the Telegram copy is a
       * far smaller harm than turning a successful notification into a 500 for
       * whoever triggered it.
       */
      this.logger.warn(
        `Could not queue a Telegram notification for user ${userId}: ${describe(error)}`,
      );
    }
  }

  /** The origin every deep link is built on, trailing slash removed. */
  get publicUrl(): string {
    return (this.config.get<string>('APP_PUBLIC_URL') ?? '').trim().replace(/\/+$/, '');
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
