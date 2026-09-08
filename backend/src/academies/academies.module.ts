import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AcademiesService } from './academies.service';
import { EndorsementsService } from './endorsements.service';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { InvitationsProcessor } from './invitations.processor';
import { INVITATIONS_QUEUE } from './invitations.constants';
import { TelegramModule } from '../telegram/telegram.module';
import { SquadNotificationsService } from './squad-notifications.service';
import { AcademiesController } from './academies.controller';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  // TariffsModule for the plan's caps on coaches and squad groups.
  imports: [
    RbacModule,
    NotificationsModule,
    TariffsModule,
    // The operator's Telegram alert when a player joins a squad.
    TelegramModule,
    // The delayed settlement of an accepted invitation — see invitations.constants.ts.
    BullModule.registerQueue({ name: INVITATIONS_QUEUE }),
  ],
  controllers: [AcademiesController],
  providers: [
    AcademiesService,
    EndorsementsService,
    GroupsService,
    InvitationsService,
    InvitationsProcessor,
    SquadNotificationsService,
  ],
  exports: [
    AcademiesService,
    EndorsementsService,
    GroupsService,
    InvitationsService,
    SquadNotificationsService,
  ],
})
export class AcademiesModule {}
