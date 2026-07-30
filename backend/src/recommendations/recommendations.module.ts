import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AcademiesModule, NotificationsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
