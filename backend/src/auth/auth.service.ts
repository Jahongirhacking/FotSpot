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
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { ClientInfo } from '../common/decorators/client-info.decorator';
import { generateUsername, normaliseUsername } from '../users/username.util';
import {
  ChangePasswordDto,
  LoginEmailDto,
  OAuthLoginDto,
  RefreshTokenDto,
  RegisterEmailDto,
  RequestRegistrationCodeDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const OTP_TTL_SECONDS = 300;
/** Longer than the login OTP: this one is typed once, mid-signup, from an inbox
 *  the user may have to go and open on another device. */
const REGISTRATION_CODE_TTL_SECONDS = 900;
const REFRESH_TTL_FALLBACK_DAYS = 30;

/** Refresh-token claims. `sid` scopes the token to one Session row (1.21). */
interface RefreshClaims {
  sub: string;
  sid: string;
}

/**
 * ## Signing up grants no role
 *
 * The first thing a new account does is answer "do you play, or do you spot
 * talent?" (§1.2.2), and that answer is what assigns one.
 *
 * `scout` used to be handed out automatically, which quietly made the question
 * decorative: everybody already was a scout, so "become a scout" could never be
 * offered and the choice only set a cookie. A role the product asks you to pick
 * has to be a role you do not already hold.
 *
 * A roleless account is a real but brief state — the app layout sends it to
 * /welcome, which needs no role and is the only place it can go.
 */
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private rbac: RbacService,
    private throttle: RateLimitService,
  ) {}

  // ---------- Email + Password ----------

  /**
   * Step 1 of signing up: send a code to the address, before any account exists.
   *
   * Conflicts are reported here rather than after the user has typed a code —
   * the address's existence is already discoverable from registration itself, so
   * withholding it would buy no privacy and cost a wasted round trip.
   *
   * Delivery is the documented email stub. In non-production the code comes back
   * in the response so the flow is testable; in production nothing is sent yet
   * and the caller is told so instead of being left waiting.
   */
  async requestRegistrationCode(dto: RequestRegistrationCodeDto, client: ClientInfo = {}) {
    // Bounded on the same counter as code entry: without it, one caller can make
    // the server send unlimited mail to addresses they do not own.
    await this.throttle.assertAllowed('registration', client.ipAddress);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const code = crypto.randomInt(100000, 999999).toString();
    await this.prisma.registrationCode.create({
      data: {
        email,
        codeHash: await argon2.hash(code),
        expiresAt: new Date(Date.now() + REGISTRATION_CODE_TTL_SECONDS * 1000),
      },
    });

    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      sent: true,
      expiresInSeconds: REGISTRATION_CODE_TTL_SECONDS,
      ...(isProd ? { emailNotConfigured: true } : { devCode: code }),
    };
  }

  /**
   * Step 2: create the account, but only against a code that checks out.
   *
   * The address is therefore proved before the row exists — there is no such
   * thing as an unverified account to chase later, and no window in which one can
   * be used. `emailVerifiedAt` records the moment rather than a boolean, because
   * "when" is the question asked during a support conversation.
   */
  async registerEmail(dto: RegisterEmailDto, client: ClientInfo = {}) {
    await this.throttle.assertAllowed('registration', client.ipAddress);

    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const pending = await this.prisma.registrationCode.findFirst({
      where: { email, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending) throw new BadRequestException('Request a code for this address first');
    if (pending.expiresAt < new Date()) throw new BadRequestException('That code has expired');
    if (!(await argon2.verify(pending.codeHash, dto.code))) {
      await this.throttle.recordFailure('registration', client.ipAddress);
      throw new BadRequestException('That code is not right');
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.registrationCode.update({ where: { id: pending.id }, data: { consumed: true } });
      return tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          emailVerifiedAt: new Date(),
          username: await this.mintUsername(tx),
        },
      });
    });

    await this.throttle.clear('registration', client.ipAddress);
    return this.issueTokens(user.id, client);
  }

  /**
   * A free handle. Collisions are a coincidence to retry, not an error to raise:
   * the space is ~13 million, so a second attempt is already unlikely and a fifth
   * is negligible.
   */
  private async mintUsername(tx: { user: { findUnique: Function } }): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateUsername();
      const clash = await tx.user.findUnique({ where: { username: candidate } });
      if (!clash) return candidate;
    }
    // Astronomically unlikely; the unique index is the real guarantee anyway.
    return `${generateUsername()}-${crypto.randomInt(1000, 9999)}`;
  }

  /**
   * Password sign-in by email or username.
   *
   * Every failure returns the same "Invalid credentials": distinguishing "no such
   * user" from "wrong password" turns the endpoint into an oracle for which phone
   * numbers and academy usernames exist.
   */
  async loginEmail(dto: LoginEmailDto, client: ClientInfo = {}) {
    // Before the credential is looked at, so a blocked caller cannot use timing
    // or the error message to learn whether their guess was right.
    await this.throttle.assertAllowed('login', client.ipAddress);

    if (!dto.email && !dto.username) {
      throw new BadRequestException('Enter your email or username');
    }

    // Normalised, so a pasted "@Joxa" signs in the same as "joxa" — the handle is
    // shown with an @ everywhere, and people type back what they were shown.
    const user = await this.prisma.user.findUnique({
      where: dto.email
        ? { email: dto.email.trim().toLowerCase() }
        : { username: normaliseUsername(dto.username!) },
    });
    if (!user || !user.passwordHash) {
      await this.throttle.recordFailure('login', client.ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.throttle.recordFailure('login', client.ipAddress);
      throw new UnauthorizedException('Invalid credentials');
    }
    // A disabled account is not a wrong guess, so it does not count against the
    // streak — the person knows their own password and retrying will not help.
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    await this.throttle.clear('login', client.ipAddress);
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
    await this.throttle.assertAllowed('login', client.ipAddress);

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('No pending OTP for this phone');
    if (otp.expiresAt < new Date()) throw new BadRequestException('OTP expired');

    const valid = await argon2.verify(otp.codeHash, dto.code);
    if (!valid) {
      // A six-digit code is a million guesses; ten tries is what keeps that a
      // million rather than an afternoon.
      await this.throttle.recordFailure('login', client.ipAddress);
      throw new BadRequestException('Invalid OTP code');
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone: dto.phone, username: await this.mintUsername(this.prisma) },
      });
    }
    if (!user.isActive) throw new UnauthorizedException('Account disabled');

    await this.throttle.clear('login', client.ipAddress);
    return this.issueTokens(user.id, client);
  }

  // ---------- OAuth (extension point) ----------

  async oauthLogin(dto: OAuthLoginDto, client: ClientInfo = {}) {
    // NOTE (minimal MVP): server-side verification of `providerToken` against
    // Google/Facebook/OneID must be added here before trusting `dto.email`.
    // Left as an explicit extension point rather than faked.
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email: dto.email, username: await this.mintUsername(this.prisma) },
      });
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
