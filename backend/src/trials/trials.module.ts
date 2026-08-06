import { Module } from '@nestjs/common';
import { TrialsService } from './trials.service';
import { TrialsController } from './trials.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { AcademiesModule } from '../academies/academies.module';

@Module({
  imports: [NotificationsModule, RecommendationsModule, AcademiesModule],
  controllers: [TrialsController],
  providers: [TrialsService],
  exports: [TrialsService],
})
export class TrialsModule {}
