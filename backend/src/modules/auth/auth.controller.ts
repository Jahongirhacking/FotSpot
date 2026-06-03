// src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard, Public } from "../../common/guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import {
  LoginWithEmailDto,
  RefreshTokenDto,
  RegisterWithEmailDto,
  SendOtpDto,
  VerifyOtpDto,
} from "./dto/auth.dto";

@ApiTags("auth")
@Controller("auth")
@UseGuards(JwtAuthGuard) // Applied globally but @Public() overrides per-route
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Email + Password ────────────────────────────────────────────

  @Public()
  @Post("register/email")
  @ApiOperation({ summary: "Register with email and password" })
  registerWithEmail(@Body() dto: RegisterWithEmailDto) {
    return this.authService.registerWithEmail(dto);
  }

  @Public()
  @Post("login/email")
  @HttpCode(HttpStatus.OK) // Default is 201, override to 200 for login
  @ApiOperation({ summary: "Login with email and password" })
  loginWithEmail(@Body() dto: LoginWithEmailDto) {
    return this.authService.loginWithEmail(dto);
  }

  // ─── Phone + OTP ─────────────────────────────────────────────────

  @Public()
  @Post("otp/send")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send OTP to phone number" })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify OTP and login/register" })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─── Token Management ────────────────────────────────────────────

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token using refresh token" })
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ─── Session ─────────────────────────────────────────────────────

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
