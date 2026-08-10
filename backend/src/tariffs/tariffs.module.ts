import { Module } from '@nestjs/common';
import { TariffsController } from './tariffs.controller';
import { TariffsService } from './tariffs.service';

/**
 * Exported, because four other modules ask it what an account may do before
 * they act — see TariffsService's note on why the checks live in one place.
 */
@Module({
  controllers: [TariffsController],
  providers: [TariffsService],
  exports: [TariffsService],
})
export class TariffsModule {}
