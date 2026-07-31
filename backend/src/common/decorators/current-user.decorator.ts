import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  /** Session (device) the access token was issued to - see README 1.21. */
  sessionId?: string;
  /**
   * The single role the caller is acting as, when they told us (§1.2.1).
   * Undefined for callers that sent no `x-active-role` header.
   */
  activeRole?: string;
  /**
   * Roles to authorize against — **narrowed to `activeRole` when one is set**.
   * Authorize against this, never `heldRoles`: switching to a lesser role has to
   * actually take the greater one's powers away. See JwtStrategy.validate.
   */
  roles: string[];
  /**
   * Every role the account holds, ignoring the active one. For telling the user
   * what they *could* switch to — not for deciding what they may do now.
   */
  heldRoles: string[];
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
