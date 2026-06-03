// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";

// JWT payload shape — what gets encoded into the token
export interface JwtPayload {
  sub: string; // user ID (standard JWT claim for subject)
  email?: string;
  phone?: string;
  roles: string[];
  iat?: number; // issued at (auto-set by jsonwebtoken)
  exp?: number; // expiry (auto-set)
}

// This strategy is triggered by AuthGuard('jwt')
// It extracts the Bearer token, verifies it, and returns the user
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Extract token from "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Reject expired tokens
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("jwt.secret"),
    });
  }

  // Called automatically after token is verified
  // Return value gets attached to request.user
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("User not found or inactive");
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      // Flatten roles into string array for easy guard usage
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }
}
