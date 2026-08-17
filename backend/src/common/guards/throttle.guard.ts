import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import { resolveClientIp } from '../client-ip.util';
import { THROTTLE_KEY, type ThrottleOptions } from '../decorators/throttle.decorator';

/**
 * The default every route inherits: 120 requests a minute per caller.
 *
 * Chosen to be invisible to a person and obstructive to a script. A busy screen
 * here makes perhaps a dozen calls as it loads; two an hundred a minute is an
 * order of magnitude above the worst honest burst and two orders below what it
 * takes to hurt the database.
 */
const DEFAULT_LIMIT = 120;
const DEFAULT_WINDOW_SECONDS = 60;

/**
 * Bounds how fast any one caller can hit the API — README §1.20.
 *
 * ## Why this exists alongside RateLimitService
 *
 * They answer different questions and neither substitutes for the other.
 * `RateLimitService` counts *consecutive failures* against a credential endpoint
 * and locks the door for half an hour: it is an anti-guessing device, and a
 * caller who keeps succeeding never trips it. This counts *requests*, successful
 * or not, and is the one that stands between the platform and a script pulling
 * every player profile it can reach or hammering the ranked feed.
 *
 * ## Keyed on the user when there is one, the address when there is not
 *
 * An address alone punishes shared connections — a school or an internet café
 * behind one NAT is exactly the setting this product is built for, and one
 * enthusiastic user there would throttle the rest. So an authenticated caller is
 * counted as themselves and gets their own budget wherever they sign in.
 *
 * Anonymous traffic falls back to the address, which is the only handle
 * available. `X-Forwarded-For` is read only when `TRUST_PROXY_HOPS` says a proxy
 * is in front — the header is caller-controlled, so honouring it unconditionally
 * would let anybody mint a fresh identity per request and make the limit
 * decorative.
 *
 * ## It fails open
 *
 * A Redis outage allows the request rather than refusing it, for the same reason
 * `RateLimitService` does: an unreachable cache that returned 429 to every
 * visitor would be a far larger incident than the traffic it guards against.
 * That is a deliberate trade and the reason this is one layer of several rather
 * than the only one — the expensive endpoints are also paginated and bounded.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const options = this.reflector.getAllAndOverride<ThrottleOptions | false | undefined>(
      THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (options === false) return true;

    const { limit, windowSeconds } = options ?? {
      limit: DEFAULT_LIMIT,
      windowSeconds: DEFAULT_WINDOW_SECONDS,
    };

    const request = context.switchToHttp().getRequest<Request>();
    const caller = this.callerId(request);
    if (!caller) return true;

    // Per route, not per caller alone: one budget shared across every endpoint
    // would let a poll of the notification bell exhaust the allowance for the
    // screen the user is actually trying to load.
    const route = `${request.method}:${context.getClass().name}.${context.getHandler().name}`;
    const key = `rate:${route}:${caller}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;

    /*
     * Shared counter only where the number has to be exact.
     *
     * A route that opted in with `@Throttle(...)` did so because its limit
     * protects something real — a code being texted, a password being guessed —
     * and those must hold across every instance, so they count in Redis.
     *
     * Every other route gets the blanket default, which exists to stop a
     * runaway client rather than to enforce a promise. Counting *that* in Redis
     * meant a round trip on every single request the API served, and on a
     * per-command Redis plan it was the largest line on the bill by a distance:
     * a page load is five or ten API calls and each was paying for a counter
     * nobody reads. In memory it is free, and the only thing lost is that with
     * N instances the effective ceiling is N × limit — which for a coarse
     * safety net is a rounding error, and the exact limits are unaffected.
     */
    const count = options
      ? await this.redis.incrementInWindow(key, windowSeconds)
      : this.countInMemory(key, windowSeconds);
    if (count === null || count <= limit) return true;

    throw new HttpException(
      {
        message: 'Too many requests. Please slow down and try again shortly.',
        retryAfterSeconds: windowSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * The per-instance counter behind the blanket default.
   *
   * The key already carries the window number, so an entry belongs to exactly
   * one window and is never re-read after it passes. Sweeping on write keeps
   * the map bounded without a timer: whatever is left from an earlier window is
   * dead by definition, and the cost is paid by the request that noticed.
   */
  private readonly counters = new Map<string, number>();
  private lastSweep = 0;

  private countInMemory(key: string, windowSeconds: number): number {
    const now = Date.now();
    // Once per window at most — sweeping on every request would walk the whole
    // map to reclaim a handful of keys.
    if (now - this.lastSweep > windowSeconds * 1000) {
      const current = `:${Math.floor(now / (windowSeconds * 1000))}`;
      for (const existing of this.counters.keys()) {
        if (!existing.endsWith(current)) this.counters.delete(existing);
      }
      this.lastSweep = now;
    }

    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  /**
   * Who to count this request against.
   *
   * `request.user` is unset here for authenticated routes — this guard runs
   * before `JwtAuthGuard`, on purpose, so that a flood of *unauthenticated*
   * requests is stopped before it costs a signature verification. The token is
   * therefore read directly, and only as an opaque identity string: it is not
   * verified, because a forged one buys the attacker nothing but a bucket of
   * their own invention, which is no better than the address they already had.
   */
  private callerId(request: Request): string | null {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      // The signature, not the whole token: it is the part that differs per
      // session and it keeps a credential out of the Redis keyspace.
      const signature = auth.slice(7).split('.')[2];
      if (signature) return `t:${signature.slice(0, 32)}`;
    }
    const ip = this.clientIp(request);
    return ip ? `ip:${ip}` : null;
  }

  /** See `resolveClientIp` for why the forwarded header is only half trusted. */
  private clientIp(request: Request): string | undefined {
    return resolveClientIp(request.headers, request.socket?.remoteAddress ?? request.ip);
  }
}
