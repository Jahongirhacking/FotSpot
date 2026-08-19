import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';

import { AcademiesModule } from './academies/academies.module';
import { StorageModule } from './storage/storage.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { RequestsModule } from './requests/requests.module';
import { EmailModule } from './email/email.module';
import { SmsModule } from './sms/sms.module';
import { AuthModule } from './auth/auth.module';
import { CoachesModule } from './coaches/coaches.module';
import { FollowsModule } from './follows/follows.module';
import { InsightsModule } from './insights/insights.module';
import { MediaModule } from './media/media.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlayersModule } from './players/players.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { RedisModule } from './redis/redis.module';
import { TariffsModule } from './tariffs/tariffs.module';
import { TrialsModule } from './trials/trials.module';
import { UsersModule } from './users/users.module';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottleGuard } from './common/guards/throttle.guard';
import { AppController } from './app.controller';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    /*
     * BullMQ's own Redis connection — README §1.19.
     *
     * Separate from `RedisService`'s client on purpose. That one is a cache and
     * is configured to fail soft: `maxRetriesPerRequest: 1`, offline queue off,
     * every error swallowed, because a cache miss must never break a request.
     * A queue needs the opposite temperament — BullMQ requires
     * `maxRetriesPerRequest: null` and blocking commands, and a job that is
     * silently dropped is work nobody knows was lost.
     */
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          // Required by BullMQ: its blocking commands must not be abandoned
          // mid-wait, which is what a finite retry count would do.
          maxRetriesPerRequest: null,
          /*
           * Back off hard when Redis is refusing, instead of hammering it.
           *
           * With the default strategy a permanently failing Redis — a hosted
           * plan whose request quota is spent, say — is retried about once a
           * second, for ever. Every retry is itself another request against
           * the quota that caused the failure, so the counter can only climb
           * and the logs fill with the same error until somebody notices.
           *
           * Doubling to a two-minute ceiling keeps a brief blip invisible (the
           * first few retries are still sub-second) while turning a sustained
           * outage into roughly thirty attempts an hour rather than three and
           * a half thousand.
           */
          retryStrategy: (times: number) => Math.min(50 * 2 ** Math.min(times, 12), 120_000),
        },
        defaultJobOptions: {
          // Kept briefly so a completed job can be inspected while debugging,
          // then dropped: Redis is not a log. Failures are kept longer because
          // they are the ones somebody comes looking for.
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600 },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    RateLimitModule,
    AuditModule,
    RequestsModule,
    EmailModule,
    SmsModule,
    RbacModule,
    TariffsModule,
    AuthModule,
    UsersModule,
    PlayersModule,
    CoachesModule,
    AcademiesModule,
    MediaModule,
    FollowsModule,
    RecommendationsModule,
    TrialsModule,
    NotificationsModule,
    ModerationModule,
    AdminModule,
    InsightsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: authenticate first, then authorize by role, then by
    // fine-grained permission. @Public() short-circuits JwtAuthGuard only.
    //
    // ThrottleGuard sits in front of all three rather than among them. It has to
    // reject a flood *before* the request costs a signature verification and a
    // role lookup, and it is the only one of the four that must apply to
    // unauthenticated traffic — which is exactly what @Public() lets through.
    // The relative order of the other three is unchanged and load-bearing
    // (root CLAUDE.md §7).
    { provide: APP_GUARD, useClass: ThrottleGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
