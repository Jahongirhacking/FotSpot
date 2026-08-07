import { Module } from '@nestjs/common';
import { CoachesService } from './coaches.service';
import { CoachesController } from './coaches.controller';
import { RbacModule } from '../rbac/rbac.module';
import { AcademiesModule } from '../academies/academies.module';

@Module({
  // AcademiesModule for GroupsService — an assessment is gated on the coach and
  // the player sharing a squad group (TRIAL.md Rule 21).
  imports: [RbacModule, AcademiesModule],
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
