import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TrialsService } from './trials.service';
import { TrialsController } from './trials.controller';
import { TrialsProcessor } from './trials.processor';
import { TRIALS_QUEUE } from './trials.constants';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { AcademiesModule } from '../academies/academies.module';

@Module({
  imports: [
    NotificationsModule,
    RecommendationsModule,
    AcademiesModule,
    // The delayed settlement of a verdict — see trials.constants.ts.
    BullModule.registerQueue({ name: TRIALS_QUEUE }),
  ],
  controllers: [TrialsController],
  providers: [TrialsService, TrialsProcessor],
  exports: [TrialsService],
})
export class TrialsModule {}
