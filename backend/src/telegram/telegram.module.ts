import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { TelegramLinkController } from './telegram-link.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramProcessor } from './telegram.processor';
import { TelegramService } from './telegram.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TELEGRAM_QUEUE } from './telegram.constants';

/**
 * Everything Telegram, and nothing that is not.
 *
 * Only `TelegramNotificationsService` is exported. `NotificationsModule` imports
 * this to get one method — `enqueue` — and cannot reach the bot token, the Bot
 * API client or the link service through it. That is the boundary §9 asks for,
 * expressed as module wiring rather than as a convention somebody has to
 * remember:
 *
 *     NotificationsService → TelegramNotificationsService → queue → TelegramService
 *
 * `PrismaService` arrives from the global `PrismaModule` (backend/CLAUDE.md §3).
 */
@Module({
  imports: [BullModule.registerQueue({ name: TELEGRAM_QUEUE })],
  controllers: [TelegramLinkController, TelegramWebhookController],
  providers: [
    TelegramService,
    TelegramLinkService,
    TelegramNotificationsService,
    TelegramProcessor,
  ],
  exports: [TelegramNotificationsService],
})
export class TelegramModule {}
