import type { Job } from 'bullmq';
import { MediaProcessor } from './media.processor';
import {
  FINALISE_CLIP_JOB,
  NOT_ARRIVED_ERROR,
  SWEEP_STALE_JOB,
  TRANSCODE_CLIP_JOB,
} from './media-processing.constants';
import type { MediaRecoveryService } from './media-recovery.service';
import { VideoTranscoderService } from './video-transcoder.service';
import type { MediaFinaliserService } from './media-finaliser.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { ConfigService } from '@nestjs/config';

/**
 * What the worker does with a clip the browser could not compress.
 *
 * The bug these hold the line against: a host without ffmpeg was writing
 * `FAILED — "Video processing is unavailable on the server."` onto every such
 * clip. That is a fact about the deployment recorded as a verdict on a child's
 * upload, and it left the row where no admin screen looks. The distinction the
 * transcoder now draws — *this file* is broken, versus *this host* cannot
 * transcode — is asserted here as behaviour, not as source text.
 */

const JOB = {
  mediaId: 'clip-1',
  storageKey: 'private/players/player-1/clip.mp4',
  posterKey: null,
};

function job(name: string) {
  return { name, data: JOB } as unknown as Job<typeof JOB>;
}

/* -------------------------------------------------------------------------- */
/* The transcoder's own answer                                                 */
/* -------------------------------------------------------------------------- */

function transcoder(available: boolean) {
  const prisma = { media: { updateMany: jest.fn(async () => ({ count: 1 })) } };
  const service = new VideoTranscoderService(
    prisma as unknown as PrismaService,
    {} as StorageService,
    { get: () => undefined } as unknown as ConfigService,
  );
  // `isAvailable` is cached module-wide and shells out; the host answer is the
  // input under test, so it is stubbed rather than discovered.
  jest.spyOn(service, 'isAvailable').mockResolvedValue(available);
  return { service, prisma };
}

describe('VideoTranscoderService.transcodeInPlace — a host with no ffmpeg', () => {
  it('keeps the original rather than failing the clip', async () => {
    const { service } = transcoder(false);

    await expect(service.transcodeInPlace('clip-1', JOB.storageKey)).resolves.toBe('ORIGINAL_KEPT');
  });

  /*
   * The whole bug in one assertion. Nothing about the row may change because a
   * binary is missing from the image: the finaliser will still bound its size
   * and a moderator will still watch it.
   */
  it('writes nothing onto the row', async () => {
    const { service, prisma } = transcoder(false);

    await service.transcodeInPlace('clip-1', JOB.storageKey);

    expect(prisma.media.updateMany).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* What the worker does with that answer                                      */
/* -------------------------------------------------------------------------- */

function processor(outcome: 'OPTIMISED' | 'ORIGINAL_KEPT' | 'FAILED') {
  const finaliser = {
    finalise: jest.fn(async (): Promise<'ACTIVE' | 'FAILED' | 'NOT_ARRIVED' | 'GONE'> => 'ACTIVE'),
    fail: jest.fn(async () => undefined),
  };
  const transcode = { transcodeInPlace: jest.fn(async () => outcome) };
  const recovery = {
    sweep: jest.fn(async () => undefined),
    restartById: jest.fn(async () => 'RESTARTED' as const),
  };
  const worker = new MediaProcessor(
    finaliser as unknown as MediaFinaliserService,
    transcode as unknown as VideoTranscoderService,
    recovery as unknown as MediaRecoveryService,
  );
  return { worker, finaliser, transcode, recovery };
}

/** A job as the 'failed' event hands it over: attempts so far, and allowed. */
function failedJob(name: string, attemptsMade: number, attempts: number) {
  return {
    name,
    data: { ...JOB, playerId: 'player-1' },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<typeof JOB>;
}

describe('MediaProcessor.process — a clip that needed transcoding', () => {
  it('finalises a clip the host could not transcode, so it reaches moderation', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');

    await worker.process(job(TRANSCODE_CLIP_JOB));

    expect(finaliser.finalise).toHaveBeenCalledWith(JOB);
  });

  it('finalises a clip that was optimised', async () => {
    const { worker, finaliser } = processor('OPTIMISED');

    await worker.process(job(TRANSCODE_CLIP_JOB));

    expect(finaliser.finalise).toHaveBeenCalledWith(JOB);
  });

  /* The verdict that is still a verdict: ffmpeg was there and could not read
     the file. The transcoder has marked the row; the worker stops. */
  it('stops on a file ffmpeg could not process, without finalising it', async () => {
    const { worker, finaliser } = processor('FAILED');

    await worker.process(job(TRANSCODE_CLIP_JOB));

    expect(finaliser.finalise).not.toHaveBeenCalled();
  });

  it('never transcodes a clip the browser already compressed', async () => {
    const { worker, transcode, finaliser } = processor('OPTIMISED');

    await worker.process(job(FINALISE_CLIP_JOB));

    expect(transcode.transcodeInPlace).not.toHaveBeenCalled();
    expect(finaliser.finalise).toHaveBeenCalledWith(JOB);
  });

  it('throws — to schedule a retry — while the upload has not arrived', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');
    finaliser.finalise.mockResolvedValue('NOT_ARRIVED');

    await expect(worker.process(job(TRANSCODE_CLIP_JOB))).rejects.toThrow(/not arrived/);
  });
});

/* -------------------------------------------------------------------------- */
/* PROCESSING always ends                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The handler that went missing. Without it, a job that spent its attempts was
 * marked failed in Redis and purged a day later, and the row stayed PROCESSING
 * for good — the bug behind "some videos never finish processing".
 */
describe('MediaProcessor.onFailed — the last attempt writes the row', () => {
  it('does not touch the row while attempts remain', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');

    await worker.onFailed(failedJob(FINALISE_CLIP_JOB, 2, 5), new Error(NOT_ARRIVED_ERROR));

    expect(finaliser.fail).not.toHaveBeenCalled();
  });

  it('fails a clip whose file never arrived, once every attempt has looked', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');

    await worker.onFailed(failedJob(FINALISE_CLIP_JOB, 5, 5), new Error(NOT_ARRIVED_ERROR));

    expect(finaliser.fail).toHaveBeenCalledWith('clip-1', expect.stringMatching(/could not find/));
  });

  it('fails a clip whose step kept timing out, saying so', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');

    await worker.onFailed(
      failedJob(TRANSCODE_CLIP_JOB, 2, 2),
      new Error('transcode timed out after 600000ms'),
    );

    expect(finaliser.fail).toHaveBeenCalledWith('clip-1', expect.stringMatching(/too long/));
  });

  it('fails a clip on any other final error, with a reason the uploader can act on', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');

    await worker.onFailed(failedJob(TRANSCODE_CLIP_JOB, 2, 2), new Error('ENOSPC'));

    expect(finaliser.fail).toHaveBeenCalledWith('clip-1', expect.stringMatching(/try uploading/));
  });

  /* A worker that died is not a verdict on the clip: restart, bounded. */
  it('restarts, rather than fails, a job whose worker died', async () => {
    const { worker, finaliser, recovery } = processor('ORIGINAL_KEPT');

    await worker.onFailed(
      failedJob(TRANSCODE_CLIP_JOB, 1, 2),
      new Error('job stalled more than allowable limit'),
    );

    expect(recovery.restartById).toHaveBeenCalledWith('clip-1', 'stalled');
    expect(finaliser.fail).not.toHaveBeenCalled();
  });

  it('ignores a failed sweep, which has no row to write', async () => {
    const { worker, finaliser, recovery } = processor('ORIGINAL_KEPT');

    await worker.onFailed(
      { name: SWEEP_STALE_JOB, data: {}, attemptsMade: 1, opts: {} } as unknown as Job<typeof JOB>,
      new Error('boom'),
    );

    expect(finaliser.fail).not.toHaveBeenCalled();
    expect(recovery.restartById).not.toHaveBeenCalled();
  });

  it('does not throw when the row cannot be written — the sweep is the backstop', async () => {
    const { worker, finaliser } = processor('ORIGINAL_KEPT');
    finaliser.fail.mockRejectedValue(new Error('db away'));

    await expect(
      worker.onFailed(failedJob(FINALISE_CLIP_JOB, 5, 5), new Error(NOT_ARRIVED_ERROR)),
    ).resolves.toBeUndefined();
  });
});

describe('MediaProcessor.process — the sweep and the clock', () => {
  it('runs the stale-processing sweep when its job comes round', async () => {
    const { worker, recovery, finaliser } = processor('ORIGINAL_KEPT');

    await worker.process(job(SWEEP_STALE_JOB));

    expect(recovery.sweep).toHaveBeenCalled();
    expect(finaliser.finalise).not.toHaveBeenCalled();
  });

  /*
   * A download that stops receiving bytes used to hold the job active for
   * ever: the worker was alive, so BullMQ kept renewing its lock. Now the
   * attempt fails, which is what schedules the next one and, at the end, the
   * verdict.
   */
  it('fails an attempt whose finalise never returns', async () => {
    jest.useFakeTimers();
    try {
      const { worker, finaliser } = processor('ORIGINAL_KEPT');
      finaliser.finalise.mockImplementation(() => new Promise<never>(() => undefined));

      const attempt = worker.process(job(FINALISE_CLIP_JOB));
      const settled = expect(attempt).rejects.toThrow(/finalise timed out/);
      await jest.advanceTimersByTimeAsync(60_000);
      await settled;
    } finally {
      jest.useRealTimers();
    }
  });
});
