import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global, like PrismaService and RedisService: almost every module that returns a
 * user or a player needs to turn an avatar key into a URL, and threading an
 * import through each of them invites someone to build the URL by hand instead.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
