import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActionKey } from './audit.actions';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Records a privileged action - README 1.21.
   *
   * `actorId` is the user who performed the action (null for system-initiated work).
   * `meta` holds the *identifiers* involved, never raw personal data (README 11.4).
   *
   * DELIBERATE SWALLOW: a failed audit write is logged at error level and does not
   * propagate. The privileged action it describes has already committed by the time
   * this is called, so throwing would report failure for work that actually
   * succeeded - and would let a full disk silently revoke an admin's ability to
   * verify coaches. The error log is the alarm; do not copy this into a path where
   * the caller can still roll back.
   */
  async record(
    actorId: string | null,
    action: AuditActionKey,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actorId ?? undefined,
          action,
          meta: meta as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for "${action}" by ${actorId ?? 'system'}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  async listRecent(take = 100) {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
  }
}
