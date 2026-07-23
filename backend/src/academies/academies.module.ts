import { Module } from '@nestjs/common';
import { AcademiesService } from './academies.service';
import { AcademiesController } from './academies.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [AcademiesController],
  providers: [AcademiesService],
  exports: [AcademiesService],
})
export class AcademiesModule {}
