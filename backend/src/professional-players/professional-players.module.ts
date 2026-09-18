import { Module } from '@nestjs/common';
import { ProfessionalPlayersController } from './professional-players.controller';
import { ProfessionalPlayersService } from './professional-players.service';

@Module({
  controllers: [ProfessionalPlayersController],
  providers: [ProfessionalPlayersService],
  // AcademiesModule mounts the academy side of the relation on its own routes.
  exports: [ProfessionalPlayersService],
})
export class ProfessionalPlayersModule {}
