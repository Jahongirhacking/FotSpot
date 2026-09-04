import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { MediaModule } from '../media/media.module';

@Module({
  // MediaModule for MediaFinaliserService — see ModerationService.retryFailedMedia.
  imports: [MediaModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
