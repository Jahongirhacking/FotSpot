import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { TelegramLinkController } from './telegram-link.controller';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramAdminAlertsService } from './telegram-admin-alerts.service';
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
    TelegramAdminAlertsService,
    TelegramProcessor,
  ],
  // Two exports, one per audience: notifications for users who linked Telegram,
  // alerts for the operator chat named in configuration. Neither exposes the
  // token or the transport.
  exports: [TelegramNotificationsService, TelegramAdminAlertsService],
})
export class TelegramModule {}
