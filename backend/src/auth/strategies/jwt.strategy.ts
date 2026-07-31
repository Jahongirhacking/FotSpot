import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  /** Session this token was issued to, so logout can target one device (1.21). */
  sid?: string;
  roles: string[];
  permissions: string[];
}

/** Set by the Next proxy from the `fs_active_role` cookie — see below. */
export const ACTIVE_ROLE_HEADER = 'x-active-role';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
      // The active-role header lives on the request, not in the token.
      passReqToCallback: true,
    });
  }

  /**
   * Resolves the caller, narrowed to the role they are currently acting as.
   *
   * ## The active role is the authority, not the union of roles held
   *
   * README §1.2.1 makes role switching a real change of context, not a cosmetic
   * relabelling of the navigation. Someone holding both `admin` and
   * `academy_manager` who is *acting as* an academy manager must be refused when
   * they try to edit another academy — otherwise "switch role" means nothing, and
   * an admin browsing as a manager still silently mutates every record they
   * touch, which is exactly the accident role switching exists to prevent.
   *
   * So the roles handed to the guards are the single active role, not the whole
   * claim. Two properties make that safe:
   *
   * - **It only ever removes privilege.** The header is honoured only when the
   *   JWT already carries that role, so a forged `x-active-role: super_admin`
   *   narrows the account to a role it does not hold and every @Roles check then
   *   fails. There is no value of this header that grants anything.
   * - **It is not the authentication boundary.** Identity still comes from the
   *   signed token; this only decides which of that identity's hats is on.
   *
   * `permissions` is passed through unnarrowed. No route uses
   * `@RequirePermissions` today, so there is nothing to bypass — but if one is
   * added it must recompute permissions for `activeRole` rather than trust this
   * snapshot.
   *
   * With no header — curl, a direct API client, a Server Component read — nothing
   * is narrowed and the full claim applies, as before.
   */
  async validate(request: Request, payload: JwtPayload): Promise<AuthUser> {
    const claimed = request.headers[ACTIVE_ROLE_HEADER];
    const requested = Array.isArray(claimed) ? claimed[0] : claimed;
    const activeRole = requested && payload.roles.includes(requested) ? requested : undefined;

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      activeRole,
      roles: activeRole ? [activeRole] : payload.roles,
      heldRoles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
