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
