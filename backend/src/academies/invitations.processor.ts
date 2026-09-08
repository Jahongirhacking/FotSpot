import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';

import { InvitationsService } from './invitations.service';
import {
  IDLE_TUNING,
  INVITATIONS_QUEUE,
  SETTLE_ACCEPTANCE_JOB,
  type SettleAcceptanceJob,
} from './invitations.constants';

/**
 * Writes the membership behind an accepted invitation once its undo window
 * has closed. The job carries the invitation id and nothing else;
 * `settleAcceptance` reads the row afresh and decides whether there is still
 * a yes to act on, so a job for an undone answer completes quietly and a job
 * retried after a partial failure writes nothing twice.
 */
@Processor(INVITATIONS_QUEUE, IDLE_TUNING)
export class InvitationsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvitationsProcessor.name);

  constructor(private invitations: InvitationsService) {
    super();
  }

  /* A yes left unsettled past its window is a membership somebody was promised
     and never given; this catches the ones a dead worker dropped. Not awaited. */
  onApplicationBootstrap() {
    void this.invitations
      .settleOverdueAcceptances()
      .then((count) => {
        if (count > 0) this.logger.warn(`Re-queued ${count} overdue invitation settlement(s)`);
      })
      .catch((error: Error) => {
        this.logger.warn(`Could not sweep unsettled invitations: ${error.message}`);
      });
  }

  async process(job: Job<SettleAcceptanceJob>): Promise<void> {
    if (job.name !== SETTLE_ACCEPTANCE_JOB) return;
    const outcome = await this.invitations.settleAcceptance(job.data.invitationId);
    if (!outcome.settled) {
      this.logger.log(`Invitation ${job.data.invitationId} not settled: ${outcome.reason}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SettleAcceptanceJob> | undefined, error: Error) {
    this.logger.error(
      `Settling invitation ${job?.data.invitationId ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${error.message}`,
    );
  }
}
