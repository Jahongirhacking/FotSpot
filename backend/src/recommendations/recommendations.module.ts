import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { RecommendationsService } from './recommendations.service';
import { TrialBackingsService } from './trial-backings.service';
import { RecommendationsController } from './recommendations.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  // TariffsModule for the plan's cap on undecided recommendations.
  imports: [AcademiesModule, NotificationsModule, TariffsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, TrialBackingsService],
  exports: [RecommendationsService, TrialBackingsService],
})
export class RecommendationsModule {}
