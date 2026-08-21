import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import * as crypto from 'crypto';

import { Public } from '../common/decorators/public.decorator';
import { startMessage } from './telegram.messages';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramService } from './telegram.service';

/**
 * Where Telegram tells us somebody opened the bot.
 *
 * ## Why this endpoint has to exist at all
 *
 * A Login Widget signature proves identity; it does not grant the bot permission
 * to message anybody. Telegram refuses `sendMessage` to a user who has never
 * opened a chat with the bot — "bot can't initiate conversation with a user" —
 * so linking an account and being able to reach it are two separate facts, and
 * only the person pressing /start establishes the second. Without this, every
 * notification for a freshly linked account would fail with a 403.
 *
 * ## Public, but not unauthenticated
 *
 * `@Public()` because Telegram has no FotSpot session to present. The
 * authentication is `setWebhook`'s `secret_token`, which Telegram echoes on
 * every call as `X-Telegram-Bot-Api-Secret-Token` — compared here in constant
 * time. With no secret configured the endpoint is *closed* rather than open:
 * failing open on a route that turns notification delivery on for an arbitrary
 * Telegram id would let anyone enable messages for any linked account.
 *
 * This is not a `@Public()` mutation of the kind backend/CLAUDE.md §5 forbids —
 * it carries its own authentication, it just is not ours.
 */
@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private telegram: TelegramService,
    private links: TelegramLinkService,
    private notifications: TelegramNotificationsService,
  ) {}

  /**
   * One Telegram update.
   *
   * Always answers 200 once the secret checks out, whatever the update contained.
   * Telegram retries any non-2xx and, after enough of them, disables the webhook
   * — so an update this build does not understand must not look like a failure.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: true }> {
    this.assertFromTelegram(secret);

    const message = update?.message;
    const chatId = message?.chat?.id;
    const from = message?.from?.id;

    // Only /start, only from a private chat, and only when the sender is the
    // chat — a group the bot was added to is not somebody linking an account.
    if (!chatId || !from || String(chatId) !== String(from)) return { ok: true };
    if (!/^\/start(\s|@|$)/.test(message?.text ?? '')) return { ok: true };

    const telegramId = String(from);
    const { linked } = await this.links.enableFromStart(telegramId);

    if (!linked) {
      this.logger.debug('A /start arrived from a Telegram account no FotSpot user has linked.');
    }

    /*
     * The reply is best-effort.
     *
     * The preference is already written by this point, so a failure to reply
     * costs a confirmation message, not the thing the person came to do. It is
     * awaited rather than floated only so the handler does not return while a
     * request is still outstanding.
     */
    const origin = this.notifications.publicUrl;
    await this.telegram
      .send(telegramId, startMessage(linked, `${origin}/profile/edit`))
      .catch(() => undefined);

    return { ok: true };
  }

  /**
   * Constant-time comparison of the shared secret.
   *
   * `timingSafeEqual` needs equal lengths and throws otherwise, so length is
   * checked first — and both sides are hashed to a fixed width, which makes the
   * length check itself carry no information about the real secret.
   */
  private assertFromTelegram(given: string | undefined): void {
    const expected = this.telegram.webhookSecret;

    if (!expected) {
      this.logger.warn(
        'A Telegram webhook call arrived but TELEGRAM_WEBHOOK_SECRET is unset; refusing it.',
      );
      throw new ForbiddenException();
    }

    const a = crypto.createHash('sha256').update(given ?? '').digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(a, b)) throw new ForbiddenException();
  }
}

/** Only the fields this handler reads; Telegram sends a great many more. */
interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { id?: number | string };
  };
}
