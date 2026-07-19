import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { RbacModule } from '../rbac/rbac.module';
import { CoachesModule } from '../coaches/coaches.module';
import { AcademiesModule } from '../academies/academies.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RbacModule, CoachesModule, AcademiesModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
