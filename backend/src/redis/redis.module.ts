import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * @Global for the same reason as PrismaModule: caching is cross-cutting, and
 * re-importing this module in every feature module would be noise.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
