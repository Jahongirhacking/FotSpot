import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * `@Global`, like PrismaService, RedisService and AuditService.
 *
 * Three modules need it today and the fourth caller is a matter of time, so the
 * alternative is importing this into each of them and remembering to do it again
 * next time. It holds no per-request state, which is what makes that safe.
 */
@Global()
@Module({ providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
