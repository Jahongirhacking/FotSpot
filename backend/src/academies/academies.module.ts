import { Module } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { GroupsService } from './groups.service';
import { AcademiesController } from './academies.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [AcademiesController],
  providers: [AcademiesService, EndorsementsService, GroupsService],
  exports: [AcademiesService, EndorsementsService, GroupsService],
})
export class AcademiesModule {}
