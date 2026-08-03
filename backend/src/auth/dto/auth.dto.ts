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

export class OAuthLoginDto {
  @IsString()
  provider: 'google' | 'facebook' | 'oneid';

  /**
   * Token already verified client-side / by an upstream provider SDK.
   * NOTE: production must verify this server-side against the provider
   * before trusting `email`. Wire this in AuthService.oauthLogin().
   */
  @IsString()
  providerToken: string;

  @IsEmail()
  email: string;
}
