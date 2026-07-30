import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Per-request device fingerprint used for session/device tracking (README 1.21). */
export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Reads the device context off the request. Exists so controllers never touch the
 * raw request object directly - same reasoning as @CurrentUser.
 *
 * `x-forwarded-for` is only trustworthy behind the Nginx/load balancer of README
 * 1.20; until then `req.ip` is the honest value and the header is a hint.
 */
export const ClientInfoParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const request = ctx.switchToHttp().getRequest();
    const forwarded = request.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();

    return {
      userAgent: request.headers?.['user-agent'],
      ipAddress: forwardedIp ?? request.ip,
    };
  },
);
