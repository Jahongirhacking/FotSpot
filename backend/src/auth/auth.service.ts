import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import {
  LoginEmailDto,
  OAuthLoginDto,
  RefreshTokenDto,
  RegisterEmailDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const DEFAULT_ROLE_ON_SIGNUP = 'scout';
const OTP_TTL_SECONDS = 300;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private rbac: RbacService,
  ) {}

  // ---------- Email + Password ----------

  async registerEmail(dto: RegisterEmailDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });
    await this.rbac.assignRole(user.id, DEFAULT_ROLE_ON_SIGNUP);
    return this.issueTokens(user.id);
  }

  async loginEmail(dto: LoginEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(user.id);
  }

  // ---------- Phone + OTP ----------

  async requestOtp(dto: RequestOtpDto) {
    const code = crypto.randomInt(100000, 999999).toString();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.otpCode.create({
      data: { phone: dto.phone, codeHash, expiresAt },
    });

    // NOTE: plug an SMS gateway here (Eskiz, Play Mobile, etc). For now we
    // return a dev-only echo so the flow is testable without SMS credentials.
    const devEcho = this.config.get('NODE_ENV') !== 'production' ? { devCode: code } : {};
    return { sent: true, expiresInSeconds: OTP_TTL_SECONDS, ...devEcho };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('No pending OTP for this phone');
    if (otp.expiresAt < new Date()) throw new BadRequestException('OTP expired');

    const valid = await argon2.verify(otp.codeHash, dto.code);
    if (!valid) throw new BadRequestException('Invalid OTP code');

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      user = await this.prisma.user.create({ data: { phone: dto.phone } });
      await this.rbac.assignRole(user.id, DEFAULT_ROLE_ON_SIGNUP);
    }
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(user.id);
  }

  // ---------- OAuth (extension point) ----------

  async oauthLogin(dto: OAuthLoginDto) {
    // NOTE (minimal MVP): server-side verification of `providerToken` against
    // Google/Facebook/OneID must be added here before trusting `dto.email`.
    // Left as an explicit extension point rather than faked.
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      user = await this.prisma.user.create({ data: { email: dto.email } });
      await this.rbac.assignRole(user.id, DEFAULT_ROLE_ON_SIGNUP);
    }
    return this.issueTokens(user.id);
  }

  // ---------- Token lifecycle ----------

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshTokenHash) throw new UnauthorizedException('Invalid refresh token');

    const matches = await argon2.verify(user.refreshTokenHash, dto.refreshToken);
    if (!matches) throw new UnauthorizedException('Invalid refresh token');

    return this.issueTokens(user.id);
  }

  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    return { loggedOut: true };
  }

  private async issueTokens(userId: string) {
    const { roles, permissions } = await this.rbac.getEffectiveAccess(userId);
    const payload = { sub: userId, roles, permissions };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL') || '15m',
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL') || '30d',
      },
    );

    const refreshTokenHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash } });

    return { accessToken, refreshToken, roles, permissions };
  }
}
