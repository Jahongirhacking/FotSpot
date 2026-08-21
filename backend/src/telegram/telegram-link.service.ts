import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import {
  TelegramAuthPayload,
  verifyTelegramAuth,
} from '../auth/oauth/telegram-oauth.util';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectTelegramDto } from './dto/telegram.dto';

/**
 * Linking a Telegram account to a signed-in FotSpot account, and unlinking it.
 *
 * ## Deliberately not part of signing in
 *
 * `AuthService.telegramLogin` answers "who is this?" and may create an account.
 * This answers "may this signed-in account also be reached at this Telegram
 * id?" and may create nothing. They share exactly one thing — `verifyTelegramAuth`,
 * the signature check — and share it rather than reimplementing it, because a
 * second copy of an HMAC check is a second place an authentication bypass can
 * live.
 *
 * The comment on `telegramLogin` predicted this file: linking "needs a
 * deliberate 'connect Telegram' action from inside a signed-in session, which is
 * a different feature from signing in".
 *
 * ## A Telegram id, once attached, is permanent
 *
 * One Telegram account belongs to one FotSpot account for good. Nothing in this
 * file ever writes `telegramId: null`, and nothing ever replaces one id with
 * another — the column is only ever written on a row that currently holds
 * `null`.
 *
 * That is a security property, not tidiness. `telegramLogin` recognises a
 * returning user by `findUnique({ telegramId })`, so an id that stops being
 * stored stops being recognised, and the next Telegram sign-in with it creates a
 * **fresh account**. Detaching an id therefore hands out an unlimited supply of
 * new accounts — new plan tier, new clip quota, new everything — to anybody
 * willing to press a button twice:
 *
 *     link A → detach → sign in with A → new account → link A → detach → …
 *
 * There were two ways to detach before this: disconnecting (which set the column
 * to `null`) and connecting a *different* Telegram account while already holding
 * one (which overwrote the old id, orphaning it just as effectively and without
 * needing a disconnect at all). Both are closed here, and `attachIfFree` is the
 * only place the column is written.
 *
 * ## So "disconnect" means the notifications, not the identity
 *
 * Turning Telegram off sets `telegramNotificationsEnabled = false` and leaves the
 * id where it is. The person keeps the ability to sign in with Telegram — which
 * matters most for an account that has no other way in — and stops receiving
 * messages, which is what they actually asked for.
 *
 * Genuinely detaching an identity is a separate feature with its own
 * requirements (re-authentication, proof of another login method, an explicit
 * confirmation that the account's identity is changing). It is deliberately not
 * a side effect of a settings toggle.
 *
 * ## Accounts are never merged either
 *
 * If the Telegram id already belongs to somebody else, the answer is 409 and
 * nothing is written. Not "move it", not "merge them", not "the newest wins" —
 * every one of those hands one person's account to another on the strength of a
 * Telegram login, and the person who loses it is not present to object.
 */
@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Whether Telegram is linked, and whether the bot can actually reach it. */
  async status(userId: string): Promise<TelegramLinkStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_FIELDS,
    });
    if (!user) throw new UnauthorizedException('Account not found');

    return this.describe(user);
  }

  /**
   * Links the Telegram account the caller just proved they control.
   *
   * The id is taken from the *verified* payload, never from a field the browser
   * could set on its own — that distinction is the entire security property here.
   * A request carrying `{ telegramId: "123" }` cannot link anything: there is no
   * such field on the DTO, and `verifyTelegramAuth` is what produces the id.
   */
  async connect(userId: string, dto: ConnectTelegramDto): Promise<TelegramLinkStatus> {
    const botToken = (this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? '').trim();
    if (!botToken) {
      throw new ServiceUnavailableException(
        'Telegram is not configured on this server (TELEGRAM_BOT_TOKEN is unset).',
      );
    }

    const verified = verifyTelegramAuth(dto as unknown as TelegramAuthPayload, botToken);
    if (!verified.ok) {
      // Which check failed tells an attacker where to push and tells the person
      // nothing they can act on — the same reasoning as `telegramLogin`.
      this.logger.warn(`Rejected a Telegram link: ${verified.reason}`);
      throw new UnauthorizedException('That Telegram sign-in could not be verified');
    }

    const [owner, me] = await Promise.all([
      this.prisma.user.findUnique({
        where: { telegramId: verified.telegramId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_FIELDS }),
    ]);

    if (!me) throw new UnauthorizedException('Account not found');

    if (owner && owner.id !== userId) {
      /*
       * Somebody else holds this Telegram account.
       *
       * Nothing is written — not the other account, not this one. The message
       * names the resolution (sign in with Telegram to reach that account)
       * because "conflict" on its own leaves the person with no next step.
       */
      throw new ConflictException(ALREADY_ANOTHER_ACCOUNT);
    }

    if (owner) {
      // Already this account's. Idempotent, and it turns notifications back on:
      // pressing Connect while connected is a request to be reachable, not a
      // mistake to report. A double press or a retried request lands here too.
      return this.setNotifications(userId, true);
    }

    /*
     * This account already holds a *different* Telegram id.
     *
     * Refused, because writing the new one would overwrite the old — and an
     * overwritten id is an orphaned id, which is the account-farming path
     * described on this class with no disconnect required. Swapping which
     * Telegram account signs you in is the identity change §9 puts out of scope,
     * not something a Connect button does silently.
     */
    if (me.telegramId && me.telegramId !== verified.telegramId) {
      throw new ConflictException(
        'Your account is already connected to a different Telegram account. ' +
          'Connecting another one is not supported yet.',
      );
    }

    return this.attachIfFree(userId, verified.telegramId);
  }

  /**
   * The one place `telegramId` is ever written.
   *
   * `updateMany` with `telegramId: null` in the **where** clause, not `update`
   * by id. That makes "only attach to a row that has none" a condition the
   * database evaluates at write time rather than something the caller checked a
   * moment earlier and hopes is still true. A row that gained an id in between
   * matches nothing, updates nothing, and is reported rather than overwritten.
   */
  private async attachIfFree(userId: string, telegramId: string): Promise<TelegramLinkStatus> {
    try {
      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, telegramId: null },
        data: { telegramId, telegramNotificationsEnabled: true },
      });

      if (count === 0) {
        // The row acquired an id between the read and this write. Whatever it
        // now holds, it is not this one's to replace.
        throw new ConflictException(
          'Your account is already connected to a different Telegram account. ' +
            'Connecting another one is not supported yet.',
        );
      }

      return this.status(userId);
    } catch (error) {
      /*
       * The unique index, as the last word.
       *
       * Two people can pass the ownership lookup at the same moment and both
       * reach this write; the index is what makes only one succeed. Catching
       * P2002 turns the loser into the same 409 the check produces rather than a
       * 500 — and means that check is an optimisation of the error message, not
       * the thing enforcing uniqueness.
       */
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(ALREADY_ANOTHER_ACCOUNT);
      }
      throw error;
    }
  }

  /**
   * Turns Telegram notifications on or off, leaving the identity alone.
   *
   * This is what the Disconnect button reaches. It writes exactly one column,
   * and `telegramId` is not it — see the class note on why detaching an id hands
   * out free accounts.
   *
   * ## Why there is no "is this your only login method?" guard here any more
   *
   * There was one, and it was right for a disconnect that removed the identity:
   * an account whose only way in was Telegram would have been locked out. Now
   * that the id stays, that account can still sign in with Telegram afterwards —
   * so the guard would only stop somebody with no email and no phone from
   * turning off *messages*, which is a harmless preference and none of the
   * server's business. Keeping it would have been a check that no longer
   * protected anything, refusing something that was never dangerous.
   */
  async setNotifications(userId: string, enabled: boolean): Promise<TelegramLinkStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_FIELDS,
    });
    if (!user) throw new UnauthorizedException('Account not found');

    // Nothing to enable notifications *for*. Reported rather than written, so
    // the screen does not show "on" for an account with no Telegram attached.
    if (!user.telegramId) {
      if (enabled) {
        throw new BadRequestException('Connect a Telegram account before turning notifications on.');
      }
      return this.describe(user);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { telegramNotificationsEnabled: enabled },
      select: SAFE_FIELDS,
    });
    return this.describe(updated);
  }

  /**
   * Turns on notifications for a Telegram id that has just pressed /start.
   *
   * Called only from the webhook, and matched on `telegramId` — the account is
   * whoever already linked this Telegram id, which is the only association that
   * exists. Returns whether a linked account was found so the bot can reply with
   * the right of its two messages.
   */
  async enableFromStart(telegramId: string): Promise<{ linked: boolean }> {
    const { count } = await this.prisma.user.updateMany({
      where: { telegramId },
      data: { telegramNotificationsEnabled: true },
    });
    return { linked: count > 0 };
  }

  /**
   * The shape the API returns — and the reason it is a whitelist.
   *
   * No Telegram id, username, name or photo. The screen asks one question
   * ("connected?") and a second ("can the bot reach you?"), and answering it with
   * the id would put a stable cross-service identifier into every response, the
   * browser's cache and any log that records bodies, for no gain to the person
   * reading it.
   */
  private describe(user: SafeUser): TelegramLinkStatus {
    return {
      connected: user.telegramId !== null,
      notificationsEnabled: user.telegramNotificationsEnabled,
      botUsername: (this.config.get<string>('TELEGRAM_BOT_USERNAME') ?? '').trim() || null,
    };
  }
}

export interface TelegramLinkStatus {
  connected: boolean;
  /** True only once the person has opened the bot — see the schema comment. */
  notificationsEnabled: boolean;
  /** So the UI can link to the bot without hardcoding a handle. Never the token. */
  botUsername: string | null;
}

/** One sentence, used by both paths that can hit it, so they cannot drift. */
const ALREADY_ANOTHER_ACCOUNT =
  'This Telegram account is already connected to another FotSpot account. ' +
  'Please sign in with Telegram to access that account.';

const SAFE_FIELDS = {
  telegramId: true,
  telegramNotificationsEnabled: true,
} as const;

type SafeUser = { telegramId: string | null; telegramNotificationsEnabled: boolean };
