import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * @Global: auditing is cross-cutting (README 1.15 lists Audit as its own module).
 * Any service performing a privileged action injects AuditService directly rather
 * than every feature module importing this one.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
