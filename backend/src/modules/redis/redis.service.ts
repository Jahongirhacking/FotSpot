import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

// Redis is used for:
// 1. Caching (player profiles, scout rankings, leaderboards)
// 2. OTP storage (phone auth codes)
// 3. Refresh token tracking
// 4. BullMQ job queues
// 5. WebSocket adapter (Socket.io Redis adapter for horizontal scaling)
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>("redis.host"),
      port: this.configService.get<number>("redis.port"),
      password: this.configService.get<string>("redis.password") || undefined,
      // Retry strategy: exponential backoff
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.client.on("connect", () => this.logger.log("✅ Redis connected"));
    this.client.on("error", (err) => this.logger.error("Redis error", err));
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log("🔌 Redis disconnected");
  }

  // ─── Raw client access (for BullMQ, Socket.io adapter) ────────
  getClient(): Redis {
    return this.client;
  }

  // ─── Key helpers ────────────────────────────────────────────────
  // Standardized key prefixes prevent key collisions
  static keys = {
    otp: (phone: string) => `otp:${phone}`,
    playerProfile: (id: string) => `cache:player:${id}`,
    academyProfile: (id: string) => `cache:academy:${id}`,
    scoutRankings: () => `cache:scout:rankings`,
    refreshToken: (tokenId: string) => `refresh:${tokenId}`,
    userOnline: (userId: string) => `ws:online:${userId}`,
  };

  // ─── Cache helpers ──────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ─── JSON helpers (for caching objects) ─────────────────────────

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  // ─── OTP specific ───────────────────────────────────────────────

  async setOtp(phone: string, code: string, ttlSeconds: number): Promise<void> {
    await this.set(RedisService.keys.otp(phone), code, ttlSeconds);
  }

  async getOtp(phone: string): Promise<string | null> {
    return this.get(RedisService.keys.otp(phone));
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.del(RedisService.keys.otp(phone));
  }

  // ─── Increment (for rate limiting) ──────────────────────────────

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }
}
