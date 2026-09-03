import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RbacModule } from '../rbac/rbac.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [RbacModule, MediaModule, TelegramModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
