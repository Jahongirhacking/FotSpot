import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * How long to wait on the Bot API before giving up.
 *
 * Nothing user-facing blocks on this — deliveries run on a queue — but a socket
 * left open is a socket held, and an API that never answers would accumulate one
 * per notification. Five seconds matches `EmailService` and `SmsService`.
 */
const SEND_TIMEOUT_MS = 5000;

/** What a send attempt established, in terms the caller can act on. */
export type TelegramSendResult =
  /** Delivered. */
  | { status: 'sent' }
  /** No bot token configured. Not an error — see the class note. */
  | { status: 'unconfigured' }
  /**
   * Telegram says this chat can never be reached: the person blocked the bot,
   * never started it, or deleted their account. Retrying is pointless, and the
   * caller should stop trying — this is what turns the preference back off.
   */
  | { status: 'unreachable'; reason: string }
  /** A transient failure: a network error, a 429, a 5xx. Worth retrying. */
  | { status: 'failed'; reason: string };

/**
 * The Telegram Bot API, and nothing above it.
 *
 * ## Unconfigured is a supported state, not a crash
 *
 * The same arrangement as `EmailService` and `SmsService`: with no
 * `TELEGRAM_BOT_TOKEN` this reports `unconfigured`, logs once at debug level and
 * makes **no network call at all**. Nothing upstream changes behaviour — a
 * notification is still written, still pushed over the socket, still listed — and
 * the only difference is that no Telegram message goes out. That keeps local
 * development and CI working without a bot, and it means wiring one later is a
 * deployment change rather than a code change.
 *
 * ## The token lives here and nowhere else
 *
 * It is read from config on each use rather than captured at construction, is
 * never logged, and never appears in a thrown message. It travels in the URL
 * path because that is the only place the Bot API accepts it — which is
 * precisely why `describeFailure` below scrubs the URL out of anything it
 * reports, or the first failed send would put the bot token in the log.
 *
 * ## Why this knows nothing about notifications
 *
 * One method talks to Telegram; everything above it deals in "send this text to
 * this chat". Swapping transport, adding rate limiting or moving to a different
 * bot is an edit to `send` rather than a search through the notification flow —
 * and `TelegramNotificationsService` can be tested without a network at all.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private config: ConfigService) {}

  /** A bot token, or the bot is not wired up. */
  get isConfigured(): boolean {
    return Boolean(this.botToken);
  }

  private get botToken(): string {
    return (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
  }

  /**
   * The secret Telegram echoes back on every webhook call.
   *
   * Exposed so the webhook controller can compare against it. Empty means the
   * webhook is closed — see `TelegramWebhookController`.
   */
  get webhookSecret(): string {
    return (this.config.get<string>('TELEGRAM_WEBHOOK_SECRET') ?? '').trim();
  }

  /**
   * Sends one message, in Telegram's own markup dialect.
   *
   * `HTML` rather than `MarkdownV2`: Telegram's MarkdownV2 requires escaping
   * fifteen punctuation characters, and a player's name or an academy's note
   * containing a `.` or a `-` would break the whole message. HTML needs three
   * escapes, which `escapeHtml` in `telegram.messages.ts` handles.
   *
   * Never throws. Every outcome is a returned status, because the caller is a
   * queue worker deciding whether to retry — and an exception would make
   * "unreachable" and "try again later" look identical.
   */
  async send(chatId: string, text: string): Promise<TelegramSendResult> {
    const token = this.botToken;
    if (!token) {
      this.logger.debug('TELEGRAM_BOT_TOKEN is unset; skipping a Telegram message.');
      return { status: 'unconfigured' };
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          // The link at the end of every message would otherwise render a
          // preview card taller than the notification itself.
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (response.ok) return { status: 'sent' };

      const body = (await response.json().catch(() => ({}))) as TelegramApiError;
      const reason = this.describeFailure(response.status, body, token);

      /*
       * 403 is the whole reason `telegramNotificationsEnabled` exists.
       *
       * Telegram answers it for "bot was blocked by the user", "user is
       * deactivated" and "bot can't initiate conversation with a user" — all of
       * them permanent for this chat. 400 "chat not found" is the same class of
       * answer. Treating these as retryable would mean every future notification
       * queues a delivery that cannot succeed.
       */
      if (response.status === 403 || this.isChatGone(body)) {
        return { status: 'unreachable', reason };
      }

      return { status: 'failed', reason };
    } catch (error) {
      // A timeout, DNS, a refused connection. None of them says anything about
      // the chat, so none of them turns the preference off.
      return { status: 'failed', reason: error instanceof Error ? error.name : 'network error' };
    }
  }

  /** `400 Bad Request: chat not found` — permanent, despite the 400. */
  private isChatGone(body: TelegramApiError): boolean {
    return /chat not found/i.test(body?.description ?? '');
  }

  /**
   * A failure, in words safe to log.
   *
   * Telegram echoes the request URL into some error bodies, and the bot token is
   * *in* that URL — so the description is scrubbed before it goes anywhere. This
   * is the one place a token could realistically leak into a log file.
   *
   * The token we actually hold is removed **literally**, not by matching the
   * shape a token usually has. A pattern is a guess about a format Telegram owns
   * and can change, and a guess that stops matching fails open — it would keep
   * logging happily while quietly publishing the credential. Redacting the exact
   * string cannot miss it. The pattern stays afterwards only as a backstop for a
   * token that is not ours (a proxy's, say) appearing in a relayed message.
   */
  private describeFailure(status: number, body: TelegramApiError, token: string): string {
    const description = (body?.description ?? '')
      .split(token)
      .join('<redacted>')
      .replace(/bot\d+:[\w-]+/gi, 'bot<redacted>');
    return description ? `${status}: ${description}` : String(status);
  }
}

interface TelegramApiError {
  ok?: boolean;
  description?: string;
  error_code?: number;
}
