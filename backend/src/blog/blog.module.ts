import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module';
import { StorageModule } from '../storage/storage.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * The editorial blog. Reading is public; writing is admin-only. Storage is
 * imported for the covers — public objects under `public/blog/`.
 */
@Module({
  // Players for the sidebar's star row — the one star calculation, not a copy.
  imports: [StorageModule, PlayersModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
