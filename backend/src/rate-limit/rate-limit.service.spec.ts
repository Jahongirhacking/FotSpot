import { HttpException } from '@nestjs/common';
import { RateLimitService, MAX_ATTEMPTS } from './rate-limit.service';
import type { RedisService } from '../redis/redis.service';

/** In-memory stand-in. TTLs are irrelevant to the logic under test. */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    service: {
      getJson: async <T>(key: string) => (store.get(key) as T) ?? null,
      setJson: async (key: string, value: unknown) => void store.set(key, value),
      del: async (...keys: string[]) => keys.forEach((key) => store.delete(key)),
    } as unknown as RedisService,
  };
}

/** Redis is down: every call rejects. */
function brokenRedis() {
  const boom = async () => {
    throw new Error('redis unreachable');
  };
  return { getJson: boom, setJson: boom, del: boom } as unknown as RedisService;
}

const IP = '203.0.113.7';

describe('RateLimitService', () => {
  it('allows the first nine failures and blocks on the tenth', async () => {
    const service = new RateLimitService(fakeRedis().service);

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      await service.recordFailure('login', IP);
      await expect(service.assertAllowed('login', IP)).resolves.toBeUndefined();
    }

    await service.recordFailure('login', IP);
    await expect(service.assertAllowed('login', IP)).rejects.toThrow(HttpException);
  });

  it('answers 429 and says how long is left', async () => {
    const service = new RateLimitService(fakeRedis().service);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await service.recordFailure('login', IP);

    await service.assertAllowed('login', IP).then(
      () => {
        throw new Error('expected a block');
      },
      (error: HttpException) => {
        expect(error.getStatus()).toBe(429);
        const body = error.getResponse() as { retryAfterSeconds: number };
        expect(body.retryAfterSeconds).toBeGreaterThan(29 * 60);
        expect(body.retryAfterSeconds).toBeLessThanOrEqual(30 * 60);
      },
    );
  });

  it('counts *consecutive* failures — a success wipes the streak', async () => {
    const service = new RateLimitService(fakeRedis().service);

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await service.recordFailure('login', IP);
    await service.clear('login', IP);

    // Nine more would block if the earlier nine still counted.
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await service.recordFailure('login', IP);
    await expect(service.assertAllowed('login', IP)).resolves.toBeUndefined();
  });

  it('keeps login and registration on separate counters', async () => {
    const service = new RateLimitService(fakeRedis().service);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await service.recordFailure('login', IP);

    await expect(service.assertAllowed('login', IP)).rejects.toThrow(HttpException);
    await expect(service.assertAllowed('registration', IP)).resolves.toBeUndefined();
  });

  it('blocks one caller without touching another', async () => {
    const service = new RateLimitService(fakeRedis().service);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await service.recordFailure('login', IP);

    await expect(service.assertAllowed('login', IP)).rejects.toThrow(HttpException);
    await expect(service.assertAllowed('login', '198.51.100.2')).resolves.toBeUndefined();
  });

  it('does nothing at all without an IP, rather than sharing one bucket', async () => {
    // Every caller behind an unknown address would otherwise share a counter, and
    // ten failures anywhere would lock out everyone.
    const redis = fakeRedis();
    const service = new RateLimitService(redis.service);

    for (let i = 0; i < MAX_ATTEMPTS * 2; i++) await service.recordFailure('login', undefined);
    await expect(service.assertAllowed('login', undefined)).resolves.toBeUndefined();
    expect(redis.store.size).toBe(0);
  });

  it('fails open when Redis is unreachable', async () => {
    // A cache outage that locked every user out of signing in would be a bigger
    // incident than the brute force this guards against. The password check is
    // still behind it either way.
    const service = new RateLimitService(brokenRedis());

    await expect(service.recordFailure('login', IP)).resolves.toBeUndefined();
    await expect(service.assertAllowed('login', IP)).resolves.toBeUndefined();
    await expect(service.clear('login', IP)).resolves.toBeUndefined();
  });
});
