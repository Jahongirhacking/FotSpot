import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule, TelegramModule],
  controllers: [PlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
