// src/modules/auth/auth.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import {
  LoginWithEmailDto,
  RegisterWithEmailDto,
  SendOtpDto,
  VerifyOtpDto,
} from "./dto/auth.dto";
import { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Email Registration ──────────────────────────────────────────

  async registerWithEmail(dto: RegisterWithEmailDto) {
    // 1. Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    // 2. Hash password with argon2 (much safer than bcrypt)
    const passwordHash = await argon2.hash(dto.password);

    // 3. Create user + assign default SCOUT role in one transaction
    // Prisma transactions ensure atomicity: either all succeed or all rollback
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
      });

      // Auto-assign SCOUT role on registration
      const scoutRole = await tx.role.findUnique({ where: { name: "SCOUT" } });
      if (scoutRole) {
        await tx.userRole.create({
          data: { userId: newUser.id, roleId: scoutRole.id },
        });
      }

      // Create empty scout profile
      await tx.scoutProfile.create({
        data: { userId: newUser.id },
      });

      return newUser;
    });

    // 4. Generate tokens
    const tokens = await this.generateTokens(user.id, [{ name: "SCOUT" }]);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ─── Email Login ─────────────────────────────────────────────────

  async loginWithEmail(dto: LoginWithEmailDto) {
    // 1. Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // 2. Verify password against hash
    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // 3. Check account status
    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("Account is not active");
    }

    // 4. Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.userRoles.map((ur) => ur.role),
    );

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ─── Phone OTP Flow ──────────────────────────────────────────────

  async sendOtp(dto: SendOtpDto) {
    const ttl = this.configService.get<number>("otp.ttlSeconds") ?? 300;

    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with TTL
    await this.redis.setOtp(dto.phone, code, ttl);

    // TODO: Send SMS via provider (Eskiz.uz, Play Mobile, etc.)
    // In development, log to console
    this.logger.log(`OTP for ${dto.phone}: ${code}`);

    return { message: "OTP sent successfully" };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const storedCode = await this.redis.getOtp(dto.phone);

    if (!storedCode) {
      throw new BadRequestException("OTP expired or not found");
    }
    if (storedCode !== dto.code) {
      throw new BadRequestException("Invalid OTP code");
    }

    // Invalidate OTP after use (one-time use)
    await this.redis.deleteOtp(dto.phone);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      // First-time login with phone — auto-register
      user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            phone: dto.phone,
            firstName: "Player", // Will prompt to complete profile
            lastName: "",
          },
          include: { userRoles: { include: { role: true } } },
        });

        const scoutRole = await tx.role.findUnique({
          where: { name: "SCOUT" },
        });
        if (scoutRole) {
          await tx.userRole.create({
            data: { userId: newUser.id, roleId: scoutRole.id },
          });
        }
        await tx.scoutProfile.create({ data: { userId: newUser.id } });

        return tx.user.findUnique({
          where: { id: newUser.id },
          include: { userRoles: { include: { role: true } } },
        });
      });
    }

    const tokens = await this.generateTokens(
      user.id,
      user.userRoles.map((ur) => ur.role),
    );

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ─── Token Management ────────────────────────────────────────────

  async refreshTokens(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>("jwt.refreshSecret"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("User not found");
    }

    return this.generateTokens(
      user.id,
      user.userRoles.map((ur) => ur.role),
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async generateTokens(userId: string, roles: { name: string }[]) {
    const payload: JwtPayload = {
      sub: userId,
      roles: roles.map((r) => r.name),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>("jwt.secret"),
        expiresIn: this.configService.get<string>("jwt.expiresIn"),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>("jwt.refreshSecret"),
        expiresIn: this.configService.get<string>("jwt.refreshExpiresIn"),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  // Remove sensitive fields before sending to client
  private sanitizeUser(user: any) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
