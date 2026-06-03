import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration from "./config/configuration";
import { AcademiesModule } from "./modules/academies/academies.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CoachesModule } from "./modules/coaches/coaches.module";
import { MediaModule } from "./modules/media/media.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PlayersModule } from "./modules/players/players.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { RedisModule } from "./modules/redis/redis.module";
import { TrialsModule } from "./modules/trials/trials.module";
import { UsersModule } from "./modules/users/users.module";
import { PlayersModule } from './players/players.module';
import { ServiceModule } from './controller/service/service.module';

@Module({
  imports: [
    // ─── Configuration ─────────────────────────────────────────────
    // isGlobal: true — ConfigService available in every module without re-importing
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ".env",
    }),

    // ─── Rate Limiting ─────────────────────────────────────────────
    // Prevents brute-force attacks on auth endpoints
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // max 100 requests per IP per TTL window
      },
    ]),

    // ─── Infrastructure ────────────────────────────────────────────
    PrismaModule, // PostgreSQL ORM
    RedisModule, // Caching, queues, sessions

    // ─── Feature Modules ───────────────────────────────────────────
    AuthModule,
    UsersModule,
    PlayersModule,
    CoachesModule,
    AcademiesModule,
    MediaModule,
    RecommendationsModule,
    TrialsModule,
    NotificationsModule,
    AdminModule,
    ServiceModule,
  ],
})
export class AppModule {}
