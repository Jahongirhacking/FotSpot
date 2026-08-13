import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '../common/decorators/throttle.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ClientInfo, ClientInfoParam } from '../common/decorators/client-info.decorator';
import {
  ChangePasswordDto,
  LoginEmailDto,
  PhoneAuthStartDto,
  LogoutDto,
  GoogleOAuthDto,
  TelegramOAuthDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  RegisterEmailDto,
  RequestRegistrationCodeDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@ApiBearerAuth('bearer')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Step 1 of signing up: proves the address before an account exists for it. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 5, windowSeconds: 60 })
  @Post('register/request-code')
  requestRegistrationCode(
    @Body() dto: RequestRegistrationCodeDto,
    @ClientInfoParam() client: ClientInfo,
  ) {
    return this.authService.requestRegistrationCode(dto, client);
  }

  /** Step 2: creates the account, only against a code that checks out. */
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Post('register/email')
  registerEmail(@Body() dto: RegisterEmailDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.registerEmail(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Post('login/email')
  loginEmail(@Body() dto: LoginEmailDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.loginEmail(dto, client);
  }

  /**
   * "I forgot my password" — sends a reset code to the address on the account.
   *
   * Answers identically whether or not the account exists, so it cannot be used
   * to test which emails and handles are registered. See AuthService.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 5, windowSeconds: 60 })
  @Post('password/forgot')
  forgotPassword(@Body() dto: ForgotPasswordDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.forgotPassword(dto, client);
  }

  /**
   * Checks a reset code without spending it.
   *
   * Lets the form ask for a new password only once the code is known to be good,
   * so a typo does not discard a password the user has already entered twice. It
   * grants nothing — `password/reset` re-checks the code regardless.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Post('password/verify-code')
  verifyResetCode(@Body() dto: VerifyResetCodeDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.verifyResetCode(dto, client);
  }

  /** Sets a new password against the code, and signs every device out. */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.resetPassword(dto, client);
  }

  /**
   * Which screen this phone number gets — asked before anything is sent.
   *
   * `PASSWORD` for an account that already has one, and no SMS is sent at all;
   * `OTP` for a new number or an account that has never set a password. Sends
   * nothing itself: the client still calls `otp/request`, which keeps the message
   * behind its own cap and behind a second, deliberate press.
   */
  @Public()
  @Throttle({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('phone/start')
  phoneAuthStart(@Body() dto: PhoneAuthStartDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.phoneAuthStart(dto, client);
  }

  /**
   * Sends a login code to a phone number.
   *
   * Capped hard: every call mints a code and is meant to send a message, so an
   * uncapped route is a way to make the server text a number repeatedly — costly
   * once an SMS gateway is wired in, and a way to harass somebody long before
   * that. The other two message-senders below carry the same cap for the same
   * reason.
   */
  @Public()
  @Throttle({ limit: 5, windowSeconds: 60 })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.requestOtp(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 10, windowSeconds: 60 })
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.verifyOtp(dto, client);
  }

  /**
   * Sign in with Google, registering the account if this is its first arrival.
   *
   * Takes only the ID token: the address is read from it after Google's
   * signature has been checked, so there is nothing here a caller can assert
   * about who they are.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 20, windowSeconds: 60 })
  @Post('oauth/google')
  googleLogin(@Body() dto: GoogleOAuthDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.googleLogin(dto.idToken, client);
  }

  /**
   * Sign in with Telegram, registering the account if this is its first arrival.
   *
   * Takes the Login Widget's payload unchanged — every field is covered by the
   * signature, so dropping one would make the hash impossible to reproduce.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 20, windowSeconds: 60 })
  @Post('oauth/telegram')
  telegramLogin(@Body() dto: TelegramOAuthDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.telegramLogin(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 30, windowSeconds: 60 })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.refresh(dto, client);
  }

  /** Revokes this device by default; `allDevices` revokes every active session. */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    return this.authService.logout(user.userId, user.sessionId, dto.allDevices);
  }

  /**
   * Sets a new password and signs every other device out.
   *
   * `currentPassword` may be omitted only while the account still holds the
   * password an admin generated for it — see AuthService.changePassword.
   */
  @HttpCode(HttpStatus.OK)
  @Post('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto, user.sessionId);
  }

  /** "Where am I logged in" - README 1.21 device tracking. */
  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.userId);
  }
}
