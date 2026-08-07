import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { AcademiesModule } from '../academies/academies.module';

/** Storage comes from the global StorageModule — see src/storage. */
@Module({
  // AcademiesModule for GroupsService — rating a clip is an attribute judgement,
  // so it carries the same squad-group gate as any other (TRIAL.md Rule 21).
  imports: [AcademiesModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
