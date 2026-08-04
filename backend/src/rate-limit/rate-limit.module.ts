import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/** Global like Redis itself — any endpoint may need to throttle a caller. */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
