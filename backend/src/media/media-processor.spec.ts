import type { Job } from 'bullmq';
import { MediaProcessor } from './media.processor';
import { FINALISE_CLIP_JOB, TRANSCODE_CLIP_JOB } from './media-processing.constants';
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
  const worker = new MediaProcessor(
    finaliser as unknown as MediaFinaliserService,
    transcode as unknown as VideoTranscoderService,
  );
  return { worker, finaliser, transcode };
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
