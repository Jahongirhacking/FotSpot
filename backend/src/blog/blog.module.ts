import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

/**
 * The editorial blog. Reading is public; writing is admin-only. Storage is
 * imported for the covers — public objects under `public/blog/`.
 */
@Module({
  imports: [StorageModule],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
