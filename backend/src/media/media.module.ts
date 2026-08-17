import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaFinaliserService } from './media-finaliser.service';
import { MediaProcessor } from './media.processor';
import { MEDIA_QUEUE } from './media-processing.constants';
import { AcademiesModule } from '../academies/academies.module';
import { TariffsModule } from '../tariffs/tariffs.module';

/** Storage comes from the global StorageModule — see src/storage. */
@Module({
  imports: [
    // AcademiesModule for GroupsService — rating a clip is an attribute judgement,
    // so it carries the same squad-group gate as any other (TRIAL.md Rule 21).
    AcademiesModule,
    // TariffsModule for the per-window clip limit.
    TariffsModule,
    // The queue that finalises an upload the API never saw — see MediaProcessor.
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaProcessor, MediaFinaliserService],
  exports: [MediaService],
})
export class MediaModule {}
