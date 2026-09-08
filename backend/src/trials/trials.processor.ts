import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';

import { TrialsService } from './trials.service';
import {
  IDLE_TUNING,
  SETTLE_VERDICT_JOB,
  TRIALS_QUEUE,
  type SettleVerdictJob,
} from './trials.constants';

/**
 * Runs the consequences of a verdict once its undo window has closed.
 *
 * The job carries an application id and nothing else; `settleVerdict` reads
 * the row afresh and decides for itself whether there is still a verdict to
 * settle. A job for an undone verdict therefore completes quietly, and a job
 * retried after a partial failure sends nothing twice — the row is claimed
 * under a guard before anything goes out.
 */
@Processor(TRIALS_QUEUE, IDLE_TUNING)
export class TrialsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrialsProcessor.name);

  constructor(private trials: TrialsService) {
    super();
  }

  /*
   * A verdict left unsettled past its window is a scout never settled and a
   * player never told; this catches the ones a dead worker or a flushed Redis
   * dropped. Not awaited: an API whose other endpoints do not need it must
   * not wait on Redis to come up.
   */
  onApplicationBootstrap() {
    void this.trials
      .settleOverdueVerdicts()
      .then((count) => {
        if (count > 0) this.logger.warn(`Re-queued ${count} overdue verdict settlement(s)`);
      })
      .catch((error: Error) => {
        this.logger.warn(`Could not sweep unsettled verdicts: ${error.message}`);
      });
  }

  async process(job: Job<SettleVerdictJob>): Promise<void> {
    if (job.name !== SETTLE_VERDICT_JOB) return;
    const outcome = await this.trials.settleVerdict(job.data.applicationId);
    if (!outcome.settled) {
      this.logger.log(`Verdict for ${job.data.applicationId} not settled: ${outcome.reason}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<SettleVerdictJob> | undefined, error: Error) {
    this.logger.error(
      `Settling the verdict for ${job?.data.applicationId ?? '?'} failed (attempt ${job?.attemptsMade ?? '?'}): ${error.message}`,
    );
  }
}
