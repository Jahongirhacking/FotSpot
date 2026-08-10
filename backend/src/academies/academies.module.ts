import { Module } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { AcademiesController } from './academies.controller';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  // TariffsModule for the plan's caps on coaches and squad groups.
  imports: [RbacModule, NotificationsModule, TariffsModule],
  controllers: [AcademiesController],
  providers: [AcademiesService, EndorsementsService, GroupsService, InvitationsService],
  exports: [AcademiesService, EndorsementsService, GroupsService, InvitationsService],
})
export class AcademiesModule {}
