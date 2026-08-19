import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * `@Global`, like EmailModule and for the same reason.
 *
 * One module needs it today — trials, for a passed verdict — but SMS is the
 * channel this market actually reads, and the OTP and trial-reminder callers are
 * a matter of time. It holds no per-request state, which is what makes that safe.
 */
@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
