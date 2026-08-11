import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { resolveClientIp } from '../client-ip.util';

/** Per-request device fingerprint used for session/device tracking (README 1.21). */
export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Reads the device context off the request. Exists so controllers never touch the
 * raw request object directly - same reasoning as @CurrentUser.
 *
 * The address goes through `resolveClientIp`, which honours `X-Forwarded-For`
 * only as far as `TRUST_PROXY_HOPS` says a proxy is really in front. This used
 * to read the leftmost entry unconditionally — the one part of the chain the
 * caller writes — which made the auth lockout keyed on it bypassable by sending
 * a different header every ten attempts.
 */
export const ClientInfoParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const request = ctx.switchToHttp().getRequest();

    return {
      userAgent: request.headers?.['user-agent'],
      ipAddress: resolveClientIp(request.headers, request.socket?.remoteAddress ?? request.ip),
    };
  },
);
