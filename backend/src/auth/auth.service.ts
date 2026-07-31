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
import { ClientInfo } from '../common/decorators/client-info.decorator';
import {
  ChangePasswordDto,
  LoginEmailDto,
  OAuthLoginDto,
  RefreshTokenDto,
  RegisterEmailDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const DEFAULT_ROLE_ON_SIGNUP = 'scout';
const OTP_TTL_SECONDS = 300;
const REFRESH_TTL_FALLBACK_DAYS = 30;

/** Refresh-token claims. `sid` scopes the token to one Session row (1.21). */
interface RefreshClaims {
  sub: string;
  sid: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private rbac: RbacService,
  ) {}

  // ---------- Email + Password ----------

  async registerEmail(dto: RegisterEmailDto, client: ClientInfo = {}) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);

    // One transaction: a user without their default role is a broken account —
    // it can't register again (409) and its JWT carries no roles at all.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });
      await this.rbac.assignRole(created.id, DEFAULT_ROLE_ON_SIGNUP, tx);
      return created;
    });

    return this.issueTokens(user.id, client);
  }

  /**
   * Password sign-in by email or username.
   *
   * Every failure returns the same "Invalid credentials": distinguishing "no such
   * user" from "wrong password" turns the endpoint into an oracle for which phone
   * numbers and academy usernames exist.
   */
  async loginEmail(dto: LoginEmailDto, client: ClientInfo = {}) {
    if (!dto.email && !dto.username) {
      throw new BadRequestException('Enter your email or username');
    }

    const user = await this.prisma.user.findUnique({
      where: dto.email ? { email: dto.email } : { username: dto.username },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(user.id, client);
  }

  /**
   * Changes the caller's password and revokes every other session.
   *
   * The revocation is the point for an admin-created academy manager: the whole
   * reason to rotate that password is that someone else has seen it, so leaving
   * their existing sessions alive would rotate the credential without ending the
   * access it granted.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, sessionId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Only skipped while the account still carries the password an admin handed
    // over — after that, knowing the current one is required.
    if (!user.mustChangePassword) {
      if (!dto.currentPassword || !user.passwordHash) {
        throw new BadRequestException('Enter your current password');
      }
      const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!valid) throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword), mustChangePassword: false },
    });

    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(sessionId ? { NOT: { id: sessionId } } : {}) },
      data: { revokedAt: new Date() },
    });

    return { changed: true };
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

  async verifyOtp(dto: VerifyOtpDto, client: ClientInfo = {}) {
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
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { phone: dto.phone } });
        await this.rbac.assignRole(created.id, DEFAULT_ROLE_ON_SIGNUP, tx);
        return created;
      });
    } else {
      // Self-heal an account created before the role catalogue existed: without
      // this it keeps signing in with an empty `roles` claim and no working UI.
      await this.rbac.ensureDefaultRoleFor(user.id, DEFAULT_ROLE_ON_SIGNUP);
    }
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(user.id, client);
  }

  // ---------- OAuth (extension point) ----------

  async oauthLogin(dto: OAuthLoginDto, client: ClientInfo = {}) {
    // NOTE (minimal MVP): server-side verification of `providerToken` against
    // Google/Facebook/OneID must be added here before trusting `dto.email`.
    // Left as an explicit extension point rather than faked.
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email: dto.email } });
        await this.rbac.assignRole(created.id, DEFAULT_ROLE_ON_SIGNUP, tx);
        return created;
      });
    } else {
      await this.rbac.ensureDefaultRoleFor(user.id, DEFAULT_ROLE_ON_SIGNUP);
    }
    return this.issueTokens(user.id, client);
  }

  // ---------- Token lifecycle ----------

  /**
   * Rotates the refresh token for the *session* it was issued to, leaving the
   * user's other devices untouched.
   */
  async refresh(dto: RefreshTokenDto, client: ClientInfo = {}) {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(dto.refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({ where: { id: claims.sid } });
    if (!session || session.revokedAt || session.userId !== claims.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const matches = await argon2.verify(session.refreshTokenHash, dto.refreshToken);
    if (!matches) {
      // A valid JWT whose hash no longer matches means the token was already
      // rotated - i.e. replayed. Kill the session rather than reissuing.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token already used');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Account disabled');

    return this.issueTokens(session.userId, client, session.id);
  }

  /** Revokes the caller's current device, or every device when `allDevices`. */
  async logout(userId: string, sessionId?: string, allDevices = false) {
    if (allDevices || !sessionId) {
      const { count } = await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { loggedOut: true, sessionsRevoked: count };
    }

    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true, sessionsRevoked: count };
  }

  /** Device list for the "where am I logged in" screen (1.21 device tracking). */
  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * Issues an access/refresh pair bound to a Session row. Passing `sessionId`
   * rotates that session in place; omitting it opens a new one (a new device).
   */
  private async issueTokens(userId: string, client: ClientInfo = {}, sessionId?: string) {
    const { roles, permissions } = await this.rbac.getEffectiveAccess(userId);

    const expiresAt = new Date(Date.now() + REFRESH_TTL_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
    const session = sessionId
      ? await this.prisma.session.update({
          where: { id: sessionId },
          data: {
            lastUsedAt: new Date(),
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
          },
        })
      : await this.prisma.session.create({
          data: {
            userId,
            // Placeholder until the token below exists - the token embeds the
            // session id, so the row must be created first.
            refreshTokenHash: '',
            userAgent: client.userAgent,
            ipAddress: client.ipAddress,
            expiresAt,
          },
        });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, roles, permissions },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id } satisfies RefreshClaims,
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL') ?? '30d',
      },
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: await argon2.hash(refreshToken) },
    });

    return { accessToken, refreshToken, sessionId: session.id, roles, permissions };
  }
}
