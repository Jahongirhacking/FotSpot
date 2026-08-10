import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { RbacModule } from '../rbac/rbac.module';
import { CoachesModule } from '../coaches/coaches.module';
import { AcademiesModule } from '../academies/academies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TariffsModule } from '../tariffs/tariffs.module';

@Module({
  imports: [RbacModule, CoachesModule, AcademiesModule, NotificationsModule, TariffsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
