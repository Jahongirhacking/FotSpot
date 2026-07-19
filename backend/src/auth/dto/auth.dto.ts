import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class RegisterEmailDto {
  @IsEmail()
  email: string;

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

export class LoginEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
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
