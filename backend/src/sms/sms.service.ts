import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSingleSegment, trialPassSms } from './sms.messages';

/**
 * How long to wait on the gateway before giving up.
 *
 * Nothing blocks on this — see `sendTrialPass` — but a socket left open is a
 * socket held, and a gateway that never answers would accumulate them one per
 * verdict. Five seconds matches EmailService for the same reason.
 */
const SEND_TIMEOUT_MS = 5000;

/**
 * Outbound SMS, through whichever gateway is configured.
 *
 * ## Unconfigured is a supported state, not a crash
 *
 * The same arrangement as `EmailService`: with no `SMS_API_URL`/`SMS_API_TOKEN`/
 * `SMS_SENDER` this reports `sent: false`, logs once at debug level and makes no
 * network call at all. Nothing upstream changes behaviour — a trial PASS is
 * recorded, the recommendations settle, the player is accepted, and the only
 * difference is that no message goes out. That keeps local development and CI
 * working without credentials, and it means wiring the gateway later is a
 * deployment change rather than a code change.
 *
 * This is deliberately *not* the OTP stub in `AuthService.requestOtp`. That one
 * is a documented extension point (backend/README.md) with its own dev-echo
 * behaviour, and quietly rerouting it through here would change how sign-in
 * behaves for every developer without credentials. Wiring OTP to this gateway is
 * a separate, deliberate decision.
 *
 * ## The provider lives here and nowhere else
 *
 * One method talks to the gateway. Everything above it deals in "send this text
 * to this number", so swapping Eskiz for Play Mobile is an edit to `postToGateway`
 * rather than a search through the trial flow.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  /** All three settings, or the gateway is not wired up. */
  get isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiToken && this.sender);
  }

  private get apiUrl(): string {
    return (this.config.get<string>('SMS_API_URL') ?? '').trim();
  }

  private get apiToken(): string {
    return (this.config.get<string>('SMS_API_TOKEN') ?? '').trim();
  }

  private get sender(): string {
    return (this.config.get<string>('SMS_SENDER') ?? '').trim();
  }

  /**
   * Where a link in a message should point.
   *
   * No default: a message carrying `http://localhost:3001/trials/…` is worse
   * than one carrying no link, because it looks like it works. Unset means the
   * SMS is skipped rather than sent half-formed — see `sendTrialPass`.
   */
  private get appUrl(): string {
    return (this.config.get<string>('APP_PUBLIC_URL') ?? '').trim().replace(/\/+$/, '');
  }

  /**
   * Tells a player their trial verdict, and where to read it.
   *
   * ## Never throws, never blocks
   *
   * Every failure below returns rather than raising: an SMS is the least
   * important thing happening in `recordVerdict`, and a gateway outage must not
   * roll back a verdict a coach recorded on a pitch, nor stop the player being
   * accepted into a squad. Callers are expected to fire this without awaiting
   * it, which is only safe because nothing here rejects.
   *
   * ## Sent once because a verdict happens once
   *
   * There is no de-duplication table, deliberately. `TrialResult.applicationId`
   * is `@unique` and `recordVerdict` refuses an application that already has a
   * result, so the PASS branch is reachable exactly once per application — the
   * database already guarantees what a sent-messages log would be re-checking.
   */
  async sendTrialPass(input: {
    phone: string | null | undefined;
    trialId: string;
    /** For the log line, so a skipped message can be traced to a player. */
    playerId: string;
  }): Promise<{ sent: boolean; reason?: string }> {
    if (!input.phone) {
      // Not a fault: a phone number is optional on an account, and plenty of
      // players sign up with an email alone.
      this.logger.log(`[SMS] Player ${input.playerId} passed a trial but has no phone number.`);
      return { sent: false, reason: 'no-phone' };
    }

    if (!this.appUrl) {
      this.logger.warn(
        'APP_PUBLIC_URL is not set, so a trial-result SMS would carry no usable link. Skipped.',
      );
      return { sent: false, reason: 'no-app-url' };
    }

    // The trial's own page, which already shows a player their result — rather
    // than a route invented for this message that would then need building.
    return this.send(input.phone, trialPassSms(`${this.appUrl}/trials/${input.trialId}`));
  }

  /**
   * Sends one message, or explains why it did not.
   *
   * Returns a reason rather than throwing so a caller that *does* await this can
   * branch on it, and so the log line above the return says the same thing the
   * caller sees.
   */
  async send(to: string, text: string): Promise<{ sent: boolean; reason?: string }> {
    if (!this.isConfigured) {
      /*
       * Log, do not warn.
       *
       * Every developer and every CI run is in this state, and a warning per
       * trial verdict would train everyone to ignore the one that matters. The
       * message names the variables so somebody wiring the gateway knows what to
       * set without opening this file.
       */
      this.logger.log(
        `[SMS] Not configured (SMS_API_URL / SMS_API_TOKEN / SMS_SENDER) — no message sent to ${maskPhone(to)}.`,
      );
      return { sent: false, reason: 'not-configured' };
    }

    // Not a failure — it still sends — but it costs several times what it should
    // and that is invisible until the bill arrives.
    if (!isSingleSegment(text)) {
      this.logger.warn(
        `[SMS] Message to ${maskPhone(to)} is ${text.length} characters and may bill as more than one segment.`,
      );
    }

    try {
      const response = await this.postToGateway(to, text);

      if (!response.ok) {
        // The body says which field the gateway disliked; a bad token and an
        // unregistered sender are indistinguishable without it. Truncated, and
        // it never contains the token — that goes in the header.
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `[SMS] Gateway refused a message to ${maskPhone(to)}: ${response.status} ${detail.slice(0, 300)}`,
        );
        return { sent: false, reason: `http-${response.status}` };
      }

      this.logger.log(`[SMS] Sent to ${maskPhone(to)}`);
      return { sent: true };
    } catch (error) {
      this.logger.error(
        `[SMS] Could not reach the gateway for ${maskPhone(to)}: ${(error as Error).message}`,
      );
      return { sent: false, reason: 'unreachable' };
    }
  }

  /**
   * The only place the gateway's own shape is known.
   *
   * `{ sender, to, text }` with a bearer token is the shape Eskiz and Play Mobile
   * both accept, which is why it is the starting point — but it is a guess until
   * a real account exists, and adapting it is an edit to this one method. Nothing
   * above it knows what the body looks like.
   */
  private postToGateway(to: string, text: string): Promise<Response> {
    return fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sender: this.sender, to, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  }
}

/**
 * `+99890…4567` — enough to tell two recipients apart in a log, not enough to be
 * a phone number somebody found in a log file (README §11.4: identifiers, never
 * personal data).
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 8) return '***';
  return `${trimmed.slice(0, 5)}…${trimmed.slice(-4)}`;
}
