import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Step 1: prove the address is reachable before an account exists for it. */
export class RequestRegistrationCodeDto {
  @IsEmail()
  email: string;
}

export class RegisterEmailDto {
  @IsEmail()
  email: string;

  /** The six digits sent to `email`. Registration fails without them. */
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

/**
 * Password sign-in. Accepts an email or a username — an academy manager's account
 * is created by an admin (§1.10) and often has no email at all, so username is the
 * only identifier it can offer.
 *
 * Both are optional at the DTO layer and exactly one is required at the service
 * layer: `class-validator` can express "this field is an email" but not "one of
 * these two", and faking it with a custom constraint hides the rule from the
 * generated API reference.
 */
export class LoginEmailDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  /**
   * The third identifier, for an account that signed up by phone and has since
   * set a password.
   *
   * Added rather than given its own endpoint: what happens after the identifier
   * is resolved — the throttle, the argon2 verify, the single opaque failure, the
   * session — is identical for all three, and a second copy of that is a second
   * place for the opacity to be got wrong.
   */
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @IsString()
  password: string;
}

/** "I can't get in" — takes whatever the user remembers, email or handle. */
export class ForgotPasswordDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  identifier: string;
}

/** Step 2: is this code good? Asked before the user is made to pick a password. */
export class VerifyResetCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  identifier: string;

  @IsString()
  @Length(6, 20)
  code: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  identifier: string;

  /** Eight characters; spaces and case are forgiven before comparison. */
  @IsString()
  @Length(6, 20)
  code: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ChangePasswordDto {
  /**
   * Optional only for an account still on its admin-generated password: it is
   * about to be replaced, and requiring the manager to retype a 14-character
   * string they were sent over Telegram is friction with no security value — they
   * already proved possession by signing in with it.
   */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class RequestOtpDto {
  @IsPhoneNumber()
  phone: string;
}

export class VerifyOtpDto {
  @IsPhoneNumber()
  phone: string;

  @IsString()
  code: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  /** Defaults to this device only; true revokes every active session (1.21). */
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

/**
 * A Google ID token, and nothing else.
 *
 * Deliberately no `email` field. Its predecessor took one alongside the token and
 * trusted it, which made the endpoint a way to sign in as any address a caller
 * could name. The address now comes out of the verified token
 * (`GoogleOAuthService`), so there is nothing here for a caller to assert.
 */
export class GoogleOAuthDto {
  @IsString()
  @MaxLength(4096)
  idToken: string;
}

/**
 * The Login Widget's payload, forwarded verbatim.
 *
 * Every field is signed, so nothing may be dropped on the way — the hash is
 * computed over exactly what Telegram sent, and a missing field means a
 * signature that cannot match. That is also why this DTO does not use
 * `forbidNonWhitelisted`'s usual strictness through named fields alone: unknown
 * keys are carried through and hashed rather than stripped.
 */
export class TelegramOAuthDto {
  /*
   * `id` and `auth_date` arrive as JSON **numbers**, not strings — the widget
   * hands the browser `{ id: 123456789, auth_date: 1699999999 }` — so declaring
   * them as strings rejected every real sign-in with "id must be a string".
   *
   * Coerced rather than typed as `string | number`, because everything
   * downstream wants a string: the check-string is built with `String(value)`,
   * and `telegramId` is a text column. Coercing here means one representation
   * from the edge inward.
   *
   * Safe for the signature: Telegram signs `id=123456789`, which is exactly what
   * `String(123456789)` produces. A number that arrived as a string is unchanged.
   */
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

/**
 * "I want to sign in with this number" — asked before anything is sent.
 *
 * The point of the whole change: an account that already has a password is asked
 * for it, and no SMS is sent at all.
 */
export class PhoneAuthStartDto {
  @IsPhoneNumber()
  phone: string;
}
