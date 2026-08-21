import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ConnectTelegramDto, TelegramNotificationsDto } from './dto/telegram.dto';
import { TelegramLinkService } from './telegram-link.service';

/**
 * Connecting and disconnecting Telegram, from a signed-in session.
 *
 * Every route is authenticated by the global `JwtAuthGuard` — none carries
 * `@Public()`, which is what makes "the current user" a fact rather than
 * something the body could claim. There is no `:userId` anywhere: the account
 * acted on is always `@CurrentUser()`, so there is no id for a caller to
 * substitute and no ownership check to forget.
 *
 * Mounted under `users/me/` to sit beside `users/me/contact/*`, which solves the
 * same shape of problem (proving control of a contact method before attaching it
 * to the account). It is a controller of its own rather than more routes on
 * `UsersController` so that the Telegram module stays self-contained.
 */
@ApiTags('users')
@Controller('users/me/telegram')
export class TelegramLinkController {
  constructor(private links: TelegramLinkService) {}

  /**
   * Whether this account has Telegram connected, and whether the bot can reach it.
   *
   * Returns no Telegram id, username or photo — only the two booleans the screen
   * needs and the bot's public handle so the UI can link to it.
   */
  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.links.status(user.userId);
  }

  /**
   * Connects the Telegram account whose signed Login Widget payload is supplied.
   *
   * The body is the widget's own payload; the id is taken from it only after the
   * HMAC verifies. Answers 409 when that Telegram account already belongs to
   * somebody else — nothing is moved, merged or overwritten.
   */
  @Post('connect')
  @HttpCode(200)
  connect(@CurrentUser() user: AuthUser, @Body() dto: ConnectTelegramDto) {
    return this.links.connect(user.userId, dto);
  }

  /**
   * Turns Telegram notifications on or off.
   *
   * The Telegram identity is **not** touched — see `TelegramLinkService` for why
   * detaching one is neither this endpoint's job nor a safe thing for a settings
   * toggle to do. The account can still sign in with Telegram afterwards.
   */
  @Patch()
  setNotifications(@CurrentUser() user: AuthUser, @Body() dto: TelegramNotificationsDto) {
    return this.links.setNotifications(user.userId, dto.notificationsEnabled);
  }

  /**
   * Turns Telegram notifications off. The identity is kept.
   *
   * Kept as a `DELETE` because that is the shape the rest of the API uses for
   * "switch this off", and because the screen's button says Disconnect. It is
   * exactly `PATCH { notificationsEnabled: false }` — the same code path, so the
   * two cannot come to disagree about what disconnecting means.
   */
  @Delete()
  disconnect(@CurrentUser() user: AuthUser) {
    return this.links.setNotifications(user.userId, false);
  }
}
