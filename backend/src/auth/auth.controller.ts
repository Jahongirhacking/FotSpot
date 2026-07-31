import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ClientInfo, ClientInfoParam } from '../common/decorators/client-info.decorator';
import {
  ChangePasswordDto,
  LoginEmailDto,
  LogoutDto,
  OAuthLoginDto,
  RefreshTokenDto,
  RegisterEmailDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@ApiBearerAuth('bearer')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register/email')
  registerEmail(@Body() dto: RegisterEmailDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.registerEmail(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login/email')
  loginEmail(@Body() dto: LoginEmailDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.loginEmail(dto, client);
  }

  @Public()
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.verifyOtp(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('oauth')
  oauthLogin(@Body() dto: OAuthLoginDto, @ClientInfoParam() client: ClientInfo) {
    return this.authService.oauthLogin(dto, client);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
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
