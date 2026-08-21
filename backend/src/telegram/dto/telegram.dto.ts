import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A signed Telegram Login Widget payload, offered by a signed-in account.
 *
 * ## There is deliberately no `telegramId` field
 *
 * This is the security property of the whole feature, so it is worth stating as
 * a shape rather than a rule: the id the account gets linked to comes out of
 * `verifyTelegramAuth`, which derives it from the payload it just checked the
 * HMAC of. A request body saying `{ "telegramId": "123" }` cannot link anything
 * — the field does not exist here, and `main.ts` runs `ValidationPipe` with
 * `forbidNonWhitelisted`, so an unknown field is a 400 rather than something
 * quietly dropped.
 *
 * ## Same fields as `TelegramOAuthDto`, on purpose
 *
 * The widget sends one shape and Telegram signs all of it. Extending the auth
 * DTO instead would couple a profile endpoint to the sign-in surface, where a
 * later change made for sign-in reasons would silently alter what may be linked;
 * a class of its own is a few lines and keeps the two independent. The
 * `Transform` on `id`/`auth_date` is carried over for the same reason it exists
 * there — the widget sends them as JSON *numbers*, and everything downstream
 * wants strings.
 */
export class ConnectTelegramDto {
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString() @MaxLength(128) hash: string;

  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  @MaxLength(32)
  auth_date: string;

  @IsOptional() @IsString() @MaxLength(256) first_name?: string;
  @IsOptional() @IsString() @MaxLength(256) last_name?: string;
  @IsOptional() @IsString() @MaxLength(256) username?: string;
  @IsOptional() @IsString() @MaxLength(1024) photo_url?: string;
}

/** The notifications toggle. Deliberately cannot express anything about identity. */
export class TelegramNotificationsDto {
  @IsBoolean() notificationsEnabled: boolean;
}
