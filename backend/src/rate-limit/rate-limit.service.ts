import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Consecutive failures tolerated before the door closes. */
export const MAX_ATTEMPTS = 10;
/** How long it stays closed. */
export const BLOCK_SECONDS = 30 * 60;
/**
 * How long a *streak* of failures is remembered.
 *
 * Longer than the block, so someone at nine failures cannot simply wait a few
 * minutes and get a fresh ten. Shorter than forever, so a person who mistyped
 * their password twice last week starts clean today.
 */
const STREAK_SECONDS = 60 * 60;

/**
 * `account-deletion` is its own bucket rather than sharing `login`'s.
 *
 * The two are different attacks. Someone guessing at the login form wants in;
 * someone guessing here wants a stranger's account queued for erasure, and an
 * admin who acts on a convincing-looking request does the attacker's work for
 * them. Sharing a counter would also mean a burst against this form locks the
 * same IP out of signing in, which punishes the wrong person.
 */
export type ThrottleScope = 'login' | 'registration' | 'password-reset' | 'account-deletion';

/**
 * Counts consecutive failures per caller and locks them out after ten.
 *
 * ## Keyed on IP, deliberately not on the account
 *
 * Blocking by email or phone would let anybody lock a specific person out of
 * their own account by failing ten times against their address — a denial of
 * service handed to the attacker for free. Keyed on the source, the cost of a
 * lockout falls on whoever is doing the guessing.
 *
 * The trade this accepts is the mirror image: credential stuffing from many
 * addresses against one account is not caught here. That needs anomaly detection
 * across accounts, which is a different mechanism, and pretending this one covers
 * it would be worse than saying it does not.
 *
 * ## It fails open, in this class
 *
 * If Redis is unreachable the limiter allows the request rather than refusing it:
 * a cache outage that locked every user out of signing in would be a far larger
 * incident than the brute force it guards against, and the password check still
 * stands behind it.
 *
 * `RedisService` already swallows its own failures, so this is belt and braces —
 * but relying on that would make a lockout of the entire product depend on the
 * error handling of a different class. It is guaranteed here instead.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private redis: RedisService) {}

  /**
   * Throws 429 while a caller is blocked. Call before checking any credential —
   * a blocked caller must not learn whether their guess was right.
   */
  async assertAllowed(scope: ThrottleScope, ip: string | undefined) {
    if (!ip) return;

    const blockedUntil = await this.safely(() =>
      this.redis.getJson<number>(this.blockKey(scope, ip)),
    );
    if (!blockedUntil) return;

    const retryAfter = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
    throw new HttpException(
      {
        message: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfterSeconds: retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Records a failure and closes the door on the tenth.
   *
   * The counter is read-then-written rather than atomically incremented, because
   * `RedisService` exposes JSON get/set and nothing finer. The race that allows —
   * two simultaneous failures counting as one — costs an attacker approximately
   * nothing to exploit and would let them make eleven guesses instead of ten. A
   * bound that is occasionally eleven is not meaningfully weaker than one that is
   * always ten.
   */
  async recordFailure(scope: ThrottleScope, ip: string | undefined) {
    if (!ip) return;

    const key = this.attemptKey(scope, ip);
    const attempts = ((await this.safely(() => this.redis.getJson<number>(key))) ?? 0) + 1;
    await this.safely(() => this.redis.setJson(key, attempts, STREAK_SECONDS));

    if (attempts >= MAX_ATTEMPTS) {
      await this.safely(() =>
        this.redis.setJson(
          this.blockKey(scope, ip),
          Date.now() + BLOCK_SECONDS * 1000,
          BLOCK_SECONDS,
        ),
      );
      await this.safely(() => this.redis.del(key));
      this.logger.warn(
        `Blocked ${ip} from ${scope} for ${BLOCK_SECONDS / 60} minutes after ${attempts} failures`,
      );
    }
  }

  /** A success ends the streak — "consecutive" is the whole point. */
  async clear(scope: ThrottleScope, ip: string | undefined) {
    if (!ip) return;
    await this.safely(() => this.redis.del(this.attemptKey(scope, ip)));
  }

  /** Runs a Redis call, treating any failure as "no information". */
  private async safely<T>(run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      this.logger.warn(
        `Rate limiting is degraded — Redis call failed, allowing the request: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  private attemptKey(scope: ThrottleScope, ip: string) {
    return `throttle:${scope}:attempts:${ip}`;
  }

  private blockKey(scope: ThrottleScope, ip: string) {
    return `throttle:${scope}:blocked:${ip}`;
  }
}
