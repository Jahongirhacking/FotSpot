import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { R2StorageService } from './r2-storage.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, R2StorageService],
  exports: [MediaService],
})
export class MediaModule {}
