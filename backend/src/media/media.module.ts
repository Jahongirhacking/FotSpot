import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { BullModule } from '@nestjs/bullmq';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaFinaliserService } from './media-finaliser.service';
import { MediaProcessor } from './media.processor';
import { VideoTranscoderService } from './video-transcoder.service';
import { MEDIA_QUEUE } from './media-processing.constants';
import { AcademiesModule } from '../academies/academies.module';
import { TariffsModule } from '../tariffs/tariffs.module';

/** Storage comes from the global StorageModule — see src/storage. */
@Module({
  imports: [
    // AcademiesModule for GroupsService — rating a clip is an attribute judgement,
    // so it carries the same squad-group gate as any other (TRIAL.md Rule 21).
    AcademiesModule,
    TelegramModule,
    // TariffsModule for the per-window clip limit.
    TariffsModule,
    // The queue that finalises an upload the API never saw — see MediaProcessor.
    BullModule.registerQueue({ name: MEDIA_QUEUE }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaProcessor, MediaFinaliserService, VideoTranscoderService],
  // The finaliser is exported for the super admin's retry: re-running the same
  // checks is the only honest way to bring a FAILED upload back.
  exports: [MediaService, MediaFinaliserService],
})
export class MediaModule {}
