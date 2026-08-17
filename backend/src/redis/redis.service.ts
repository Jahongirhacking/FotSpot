import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis cache layer - README 1.19.
 *
 * Postgres stays authoritative for everything; nothing lives here that can't be
 * rebuilt from it (backend/CLAUDE.md 7). That invariant is what licenses the
 * fail-soft behaviour below.
 *
 * DELIBERATE SWALLOW: every method catches its own errors and degrades to a cache
 * miss instead of throwing. A dead Redis must not turn a working read into a 500 -
 * the caller simply falls through to Postgres. This is the same reasoning as
 * `MediaService.unlike`'s idempotent delete, and like that one it is confined to
 * this file: services calling `wrap()` never see a cache error, and they must not
 * copy this pattern for Postgres reads, where a failure is real.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';

    this.client = new Redis(url, {
      // Fail fast rather than queueing commands forever while Redis is down -
      // a cache call must never become the slowest part of a request.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    /*
     * One round trip, one billable command, still atomic.
     *
     * INCR then EXPIRE is two commands and a race; wrapping them in MULTI is
     * four (`MULTI`, `INCR`, `EXPIRE`, `EXEC`) for the same one answer. A
     * hosted Redis charges per command, and this runs on the sensitive auth
     * routes — so the difference between one and four here is most of what the
     * rate limiter costs to operate.
     *
     * The TTL is set only when the counter is created. `INCR` returning 1 is
     * exactly that moment, so the window is anchored to the first request in it
     * rather than sliding forward on every hit — an expiry refreshed each call
     * never expires under sustained load and locks the caller out for good.
     *
     * `defineCommand` registers it as a method that sends EVALSHA and falls
     * back to EVAL if the script is not cached, which is what makes it survive
     * a Redis restart without any handling here.
     */
    this.client.defineCommand('incrementInWindow', {
      numberOfKeys: 1,
      lua: `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return count
      `,
    });

    this.client.on('error', (err: Error) => {
      // Logged once per failure, not rethrown: see the class comment.
      this.logger.warn(`Redis unavailable, serving from Postgres: ${err.message}`);
    });

    void this.client.connect().catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache write failed - the authoritative write already succeeded.
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // Invalidation failed; the TTL in CacheTtl bounds how long stale data can survive.
    }
  }

  /**
   * Atomically counts one hit inside a fixed window, returning the new total.
   *
   * `INCR` rather than the read-then-write `getJson`/`setJson` pair the lockout
   * counter uses, because this one bounds *concurrent* traffic: a flood is by
   * definition many requests arriving at once, which is exactly the case where
   * read-modify-write loses increments and the limiter reports a fraction of the
   * real rate. INCR is a single round trip and cannot lose one.
   *
   * The TTL is set only when the counter is created, so the window is fixed
   * from the first request rather than sliding forward with every hit — an
   * expiry refreshed on each call would never expire under sustained load and
   * would lock the caller out permanently.
   *
   * One script rather than a MULTI, because a hosted Redis bills per command
   * and `MULTI`/`INCR`/`EXPIRE`/`EXEC` is four of them for one logical answer.
   * `defineCommand` sends EVALSHA, so the round trip and the atomicity are the
   * same and the meter moves by one. See the script's own note in `onModuleInit`.
   *
   * Returns null when Redis is unreachable, which callers must read as "no
   * information" and allow: see the class note on failing soft.
   */
  async incrementInWindow(key: string, windowSeconds: number): Promise<number | null> {
    try {
      const count = await (
        this.client as unknown as {
          incrementInWindow(key: string, window: string): Promise<number>;
        }
      ).incrementInWindow(key, String(windowSeconds));
      return count;
    } catch {
      return null;
    }
  }

  /**
   * Sets `key` only if it does not exist, returning whether this call created it.
   *
   * The "have I seen this already" primitive — one caller wins, everybody else
   * is told the slot was taken. Used to make an event idempotent for a window
   * (see MediaService.recordView) without a table to look in.
   *
   * Fails **closed**, unlike the reads above: with Redis down there is no way to
   * know whether the thing already happened, and answering "no, go ahead" turns
   * a cache outage into duplicate writes.
   */
  async claimOnce(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  /**
   * Read-through cache. Returns the cached value when present, otherwise runs
   * `loader`, caches its result and returns it.
   */
  async wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;

    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      await this.setJson(key, fresh, ttlSeconds);
    }
    return fresh;
  }
}
