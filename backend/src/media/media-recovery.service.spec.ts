import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { MediaRecoveryService } from './media-recovery.service';
import {
  MAX_PROCESSING_RESTARTS,
  PROCESSING_GAVE_UP_REASON,
  STALE_SWEEP_EVERY_MS,
  SWEEP_SCHEDULER_ID,
  SWEEP_STALE_JOB,
  TRANSCODE_CLIP_JOB,
} from './media-processing.constants';
import type { MediaFinaliserService } from './media-finaliser.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The sweep and the bounded restart: how a clip stuck at PROCESSING gets out.
 *
 * The queue is a fake keyed by job id, because what matters is what the
 * service *asks* it — whether the old job is cleared before a new one is
 * added, whether a live job is left alone — and a real Redis would only make
 * those questions slower to ask.
 */

const ROW = {
  id: 'clip-1',
  playerId: 'player-1',
  storageKey: 'private/players/player-1/clip.mp4',
  posterKey: 'private/players/player-1/poster.jpg',
  status: 'PROCESSING',
  processingAttempts: 0,
};

type FakeJob = {
  attemptsMade: number;
  failedReason: string;
  getState: jest.Mock;
  remove: jest.Mock;
};

function fakeJob(state: string, attemptsMade = 1, failedReason = ''): FakeJob {
  return {
    attemptsMade,
    failedReason,
    getState: jest.fn(async () => state),
    remove: jest.fn(async () => undefined),
  };
}

function build(row: Partial<typeof ROW> = {}, job: FakeJob | null = null, staleMinutes?: string) {
  const current = { ...ROW, ...row };
  const prisma = {
    media: {
      findMany: jest.fn(async (): Promise<unknown[]> => [current]),
      findUnique: jest.fn(async (): Promise<unknown> => current),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const finaliser = { fail: jest.fn(async () => undefined) };
  const calls: string[] = [];
  const queue = {
    getJob: jest.fn(async () => {
      calls.push('getJob');
      return job;
    }),
    add: jest.fn(async () => {
      calls.push('add');
      return undefined;
    }),
    upsertJobScheduler: jest.fn(async () => undefined),
  };
  if (job) {
    job.remove.mockImplementation(async () => {
      calls.push('remove');
    });
  }
  const config = { get: jest.fn(() => staleMinutes) };

  const service = new MediaRecoveryService(
    prisma as unknown as PrismaService,
    finaliser as unknown as MediaFinaliserService,
    queue as unknown as Queue,
    config as unknown as ConfigService,
  );
  return { service, prisma, finaliser, queue, calls, current };
}

describe('sweep — reconciling the table with the queue', () => {
  it('asks only for clips PROCESSING longer than the threshold, oldest first', async () => {
    const { service, prisma } = build({}, fakeJob('active'));
    const now = new Date('2026-09-04T12:00:00Z');

    await service.sweep(now);

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PROCESSING', createdAt: { lt: new Date('2026-09-04T11:30:00Z') } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('honours MEDIA_PROCESSING_STALE_MINUTES', async () => {
    const { service, prisma } = build({}, fakeJob('active'), '90');
    const now = new Date('2026-09-04T12:00:00Z');

    await service.sweep(now);

    expect(prisma.media.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PROCESSING', createdAt: { lt: new Date('2026-09-04T10:30:00Z') } },
      }),
    );
  });

  it.each(['active', 'waiting', 'delayed'])(
    'leaves a clip alone while its job is %s',
    async (state) => {
      const { service, queue, prisma, finaliser } = build({}, fakeJob(state));

      const summary = await service.sweep();

      expect(summary).toMatchObject({ examined: 1, running: 1, restarted: 0, failed: 0 });
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.media.updateMany).not.toHaveBeenCalled();
      expect(finaliser.fail).not.toHaveBeenCalled();
    },
  );

  it('restarts a clip that has no job at all', async () => {
    const { service, queue, prisma } = build({}, null);

    const summary = await service.sweep();

    expect(summary).toMatchObject({ examined: 1, restarted: 1 });
    expect(queue.add).toHaveBeenCalledWith(
      TRANSCODE_CLIP_JOB,
      {
        mediaId: 'clip-1',
        storageKey: ROW.storageKey,
        posterKey: ROW.posterKey,
        playerId: 'player-1',
      },
      expect.objectContaining({ jobId: 'clip-1' }),
    );
    // The restart is counted on the row, conditionally on it still processing.
    expect(prisma.media.updateMany).toHaveBeenCalledWith({
      where: { id: 'clip-1', status: 'PROCESSING' },
      data: { processingAttempts: { increment: 1 } },
    });
  });

  it('restarts a clip whose job failed and was never written to the row', async () => {
    const { service, queue } = build({}, fakeJob('failed', 2, 'transcode timed out'));

    const summary = await service.sweep();

    expect(summary).toMatchObject({ restarted: 1 });
    expect(queue.add).toHaveBeenCalled();
  });
});

describe('restart — bounded, and honest about the old job', () => {
  /*
   * The bug a naive restart would have: BullMQ ignores an add whose id already
   * exists, and the failed job keeps its id for a day. Remove, then add — in
   * that order.
   */
  it('removes the finished job under the same id before adding a new one', async () => {
    const job = fakeJob('failed');
    const { service, calls } = build({}, job);

    await service.restart(ROW, 'test');

    expect(job.remove).toHaveBeenCalled();
    expect(calls.indexOf('remove')).toBeLessThan(calls.indexOf('add'));
  });

  it('fails the clip, with a reason the uploader can read, once the restarts are spent', async () => {
    const { service, finaliser, queue } = build({
      processingAttempts: MAX_PROCESSING_RESTARTS,
    });

    const outcome = await service.restart(
      { ...ROW, processingAttempts: MAX_PROCESSING_RESTARTS },
      'stale',
    );

    expect(outcome).toBe('FAILED');
    expect(finaliser.fail).toHaveBeenCalledWith('clip-1', PROCESSING_GAVE_UP_REASON);
    expect(queue.add).not.toHaveBeenCalled();
  });

  /* Never ACTIVE from here: no test above or below sees a status write. */
  it('never writes ACTIVE', async () => {
    const { service, prisma } = build({}, null);

    await service.restart(ROW, 'test');

    const wroteActive = (prisma.media.updateMany.mock.calls as unknown as [{ data: unknown }][])
      .map(([args]) => JSON.stringify(args.data))
      .some((data) => data.includes('ACTIVE'));
    expect(wroteActive).toBe(false);
  });

  it('does nothing for a clip that is no longer PROCESSING', async () => {
    const { service, queue, prisma } = build({}, null);
    prisma.media.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.restart(ROW, 'test')).toBe('GONE');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('gives the restart back when the queue cannot take the job', async () => {
    const { service, queue, prisma } = build({}, null);
    queue.add.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await service.restart(ROW, 'test')).toBe('UNAVAILABLE');
    expect(prisma.media.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { processingAttempts: { decrement: 1 } } }),
    );
  });

  it('stands down if the job turned live between the check and the restart', async () => {
    const { service, queue } = build({}, fakeJob('active'));

    expect(await service.restart(ROW, 'test')).toBe('RUNNING');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('restartById reads the row and refuses one that is not PROCESSING', async () => {
    const { service, queue, prisma } = build({ status: 'ACTIVE' }, null);

    expect(await service.restartById('clip-1', 'stalled')).toBe('GONE');
    expect(prisma.media.updateMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('ensureScheduled — one sweep, however many instances', () => {
  it('upserts a repeating sweep on the media queue', async () => {
    const { service, queue } = build();

    expect(await service.ensureScheduled()).toBe(true);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      SWEEP_SCHEDULER_ID,
      { every: STALE_SWEEP_EVERY_MS },
      expect.objectContaining({ name: SWEEP_STALE_JOB }),
    );
  });

  it('survives Redis being away, rather than taking the boot down with it', async () => {
    const { service, queue } = build();
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.ensureScheduled()).resolves.toBe(false);
  });
});
